// code.js - Plugin principal
figma.showUI(__html__, { width: 320, height: 500 });

// Fonction pour vérifier si un style doit être exclu
function shouldExcludeStyle(styleName) {
  const name = styleName.toLowerCase();
  return name.startsWith('display') || name.startsWith('subheading');
}

// Fonction pour parcourir tous les nœuds du document
function traverseNode(node, textStyles) {
  if (node.type === 'TEXT') {
    // Vérifier si le texte utilise un style de texte
    if (node.textStyleId && node.textStyleId !== '' && typeof node.textStyleId === 'string') {
      try {
        const style = figma.getStyleById(node.textStyleId);
        if (style && !textStyles.has(style.id)) {
          // Vérifier si le style provient d'une librairie (remote) ET n'est pas exclu
          if (style.remote && !shouldExcludeStyle(style.name)) {
            textStyles.set(style.id, {
              id: style.id,
              name: style.name,
              description: style.description,
              fontFamily: node.fontName ? node.fontName.family : 'Unknown',
              fontSize: Array.isArray(node.fontSize) ? node.fontSize[0] : node.fontSize,
              fontWeight: node.fontName ? node.fontName.style : 'Unknown',
              lineHeight: node.lineHeight,
              letterSpacing: node.letterSpacing,
              paragraphSpacing: node.paragraphSpacing,
              textCase: node.textCase,
              textDecoration: node.textDecoration,
              libraryName: style.remote ? 'Librairie externe' : 'Local',
              remote: true
            });
          }
        }
      } catch (error) {
        // Ignorer les erreurs de style invalides
        console.warn('Style invalide ignoré:', node.textStyleId);
      }
    }
  }

  // Parcourir les enfants
  if ('children' in node) {
    for (const child of node.children) {
      traverseNode(child, textStyles);
    }
  }
}

// Fonction pour extraire les styles typographiques avec progression
async function extractTextStyles() {
  const textStyles = new Map();
  const pages = figma.root.children;
  const totalPages = pages.length;
  
  // Envoyer le début de la progression
  figma.ui.postMessage({
    type: 'analysis-progress',
    current: 0,
    total: totalPages,
    phase: 'pages'
  });
  
  // Parcourir toutes les pages avec progression
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    
    // Mettre à jour la progression
    figma.ui.postMessage({
      type: 'analysis-progress',
      current: i + 1,
      total: totalPages,
      phase: 'pages',
      currentPageName: page.name
    });
    
    traverseNode(page, textStyles);
    
    // Petite pause pour permettre à l'UI de se mettre à jour
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  // Fonction pour déterminer la priorité de catégorie
  function getCategoryPriority(styleName) {
    const name = styleName.toLowerCase();
    // Note: Display et Subheading sont maintenant exclus en amont
    if (name.startsWith('title')) return 1;
    if (name.startsWith('text')) return 2;
    if (name.startsWith('paragraph')) return 4; // Paragraphs à la fin
    return 3; // Autres styles avant les paragraphs
  }
  
  // Fonction pour déterminer la priorité de taille (8XL est le plus gros, puis 7XL, etc.)
  function getSizePriority(styleName) {
    const name = styleName.toLowerCase();
    
    // Gérer les tailles numériques XL (8xl, 7xl, 6xl, etc.)
    if (name.includes('8xl')) return 1;
    if (name.includes('7xl')) return 2;
    if (name.includes('6xl')) return 3;
    if (name.includes('5xl')) return 4;
    if (name.includes('4xl')) return 5;
    if (name.includes('3xl')) return 6;
    if (name.includes('2xl')) return 7;
    if (name.includes('xl') && !name.includes('2xl') && !name.includes('3xl') && !name.includes('4xl') && !name.includes('5xl') && !name.includes('6xl') && !name.includes('7xl') && !name.includes('8xl')) return 8;
    if (name.includes('lg')) return 9;
    if (name.includes('md')) return 10;
    if (name.includes('sm')) return 11;
    if (name.includes('xs') && !name.includes('2xs')) return 12;
    if (name.includes('2xs')) return 13; // 2xs est le plus petit
    return 14; // Autres tailles non reconnues à la fin
  }
  
  // Fonction pour déterminer la priorité du poids de police
  function getFontWeightPriority(styleName) {
    const name = styleName.toLowerCase();
    if (name.includes('bold') && !name.includes('semi')) return 1; // Bold
    if (name.includes('semibold') || name.includes('semi-bold')) return 2; // Semi Bold
    if (name.includes('medium')) return 3; // Medium
    if (name.includes('regular')) return 4; // Regular
    if (name.includes('light')) return 5; // Light
    return 6; // Autres poids
  }
  
  // Convertir en array pour l'envoi à l'UI
  const stylesArray = Array.from(textStyles.values());
  
  // Trier par catégorie, puis par taille, puis par poids de police
  stylesArray.sort((a, b) => {
    // D'abord par catégorie
    const categoryA = getCategoryPriority(a.name);
    const categoryB = getCategoryPriority(b.name);
    
    if (categoryA !== categoryB) {
      return categoryA - categoryB;
    }
    
    // Puis par taille (8xl > 7xl > 6xl > ... > xs > 2xs)
    const sizeA = getSizePriority(a.name);
    const sizeB = getSizePriority(b.name);
    
    if (sizeA !== sizeB) {
      return sizeA - sizeB;
    }
    
    // Puis par poids de police au sein de la même catégorie et taille
    const weightA = getFontWeightPriority(a.name);
    const weightB = getFontWeightPriority(b.name);
    
    if (weightA !== weightB) {
      return weightA - weightB;
    }
    
    // En cas d'égalité, trier par taille de police numérique décroissante
    const fontSizeA = typeof a.fontSize === 'object' ? a.fontSize.value : (a.fontSize || 0);
    const fontSizeB = typeof b.fontSize === 'object' ? b.fontSize.value : (b.fontSize || 0);
    return fontSizeB - fontSizeA;
  });
  
  return stylesArray;
}

// Écouter les messages de l'UI
figma.ui.onmessage = async msg => {
  console.log('Message reçu du plugin:', msg);
  
  if (msg.type === 'extract-styles') {
    console.log('Début de l\'extraction des styles');
    try {
      const styles = await extractTextStyles();
      console.log('Styles extraits:', styles.length);
      figma.ui.postMessage({
        type: 'styles-extracted',
        styles: styles
      });
    } catch (error) {
      console.error('Erreur lors de l\'extraction:', error);
      figma.ui.postMessage({
        type: 'error',
        message: 'Erreur lors de l\'extraction des styles: ' + error.message
      });
    }
  }
  
  if (msg.type === 'close-plugin') {
    figma.closePlugin();
  }
};