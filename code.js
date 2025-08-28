// code.js - Plugin principal
figma.showUI(__html__, { width: 320, height: 500 });

// Fonction pour parcourir tous les nœuds du document
function traverseNode(node, textStyles) {
  if (node.type === 'TEXT') {
    // Vérifier si le texte utilise un style de texte
    if (node.textStyleId && node.textStyleId !== '' && typeof node.textStyleId === 'string') {
      try {
        const style = figma.getStyleById(node.textStyleId);
        if (style && !textStyles.has(style.id)) {
          // Vérifier si le style provient d'une librairie (remote)
          if (style.remote) {
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

// Fonction pour extraire les styles typographiques
function extractTextStyles() {
  const textStyles = new Map();
  const totalPages = figma.root.children.length;
  
  // Envoyer le nombre total de pages pour initialiser la progression
  figma.ui.postMessage({
    type: 'progress-init',
    totalPages: totalPages
  });
  
  // Parcourir toutes les pages avec progression
  for (let i = 0; i < figma.root.children.length; i++) {
    const page = figma.root.children[i];
    
    // Mettre à jour la progression
    figma.ui.postMessage({
      type: 'progress-update',
      currentPage: i + 1,
      totalPages: totalPages,
      pageName: page.name
    });
    
    traverseNode(page, textStyles);
  }
  
  // Fonction pour déterminer la priorité de catégorie
  function getCategoryPriority(styleName) {
    const name = styleName.toLowerCase();
    if (name.startsWith('display')) return 1;
    if (name.startsWith('title')) return 2;
    if (name.startsWith('text')) return 3;
    if (name.startsWith('paragraph')) return 5; // Paragraphs à la fin
    return 4; // Autres styles avant les paragraphs
  }
  
  // Fonction pour déterminer la priorité de taille (2xs est plus petit que xs)
  function getSizePriority(styleName) {
    const name = styleName.toLowerCase();
    if (name.includes('2xl')) return 1;
    if (name.includes('xl')) return 2;
    if (name.includes('lg')) return 3;
    if (name.includes('md')) return 4;
    if (name.includes('sm')) return 5;
    if (name.includes('xs') && !name.includes('2xs')) return 6;
    if (name.includes('2xs')) return 7; // 2xs est le plus petit
    return 8; // Autres
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
    
    // Puis par taille (2xl > xl > lg > md > sm > xs > 2xs)
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
figma.ui.onmessage = msg => {
  console.log('Message reçu du plugin:', msg);
  
  if (msg.type === 'extract-styles') {
    console.log('Début de l\'extraction des styles');
    try {
      const styles = extractTextStyles();
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
  
  if (msg.type === 'create-styles-frame') {
    try {
      const styles = msg.styles;
      
      // Créer une nouvelle frame
      const frame = figma.createFrame();
      frame.name = 'Styles typographiques';
      frame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
      frame.layoutMode = 'VERTICAL';
      frame.primaryAxisSizingMode = 'AUTO';
      frame.counterAxisSizingMode = 'AUTO';
      frame.itemSpacing = 16;
      frame.paddingTop = 24;
      frame.paddingRight = 24;
      frame.paddingBottom = 24;
      frame.paddingLeft = 24;
      
      // Ajouter la frame à la page d'abord
      figma.currentPage.appendChild(frame);
      
      // Positionner la frame sur la page courante
      frame.x = figma.viewport.center.x - 200;
      frame.y = figma.viewport.center.y - 200;
      
      // Fonction pour créer les textes de manière synchrone
      function createTextNodes() {
        let textNodesCreated = 0;
        
        for (const style of styles) {
          try {
            const textNode = figma.createText();
            
            // Créer un texte d'exemple basé sur le nom du style
            const exampleText = style.name;
            textNode.characters = exampleText;
            
            // Appliquer le style typographique
            textNode.textStyleId = style.id;
            
            // Configurer les propriétés du texte pour l'autolayout
            textNode.layoutAlign = 'STRETCH';
            textNode.textAlignHorizontal = 'LEFT';
            
            // Ajouter le texte à la frame (autolayout)
            frame.appendChild(textNode);
            textNodesCreated++;
            
          } catch (error) {
            console.warn('Erreur lors de la création du texte pour le style:', style.name, error);
            
            // En cas d'erreur, créer un texte basique
            try {
              const fallbackTextNode = figma.createText();
              fallbackTextNode.characters = style.name;
              fallbackTextNode.layoutAlign = 'STRETCH';
              fallbackTextNode.textAlignHorizontal = 'LEFT';
              frame.appendChild(fallbackTextNode);
              textNodesCreated++;
            } catch (fallbackError) {
              console.warn('Impossible de créer le texte de fallback:', fallbackError);
            }
          }
        }
        
        return textNodesCreated;
      }
      
      // Créer tous les nœuds de texte
      const createdCount = createTextNodes();
      
      // Ajuster la frame après ajout des enfants
      frame.resize(400, frame.height);
      
      // Sélectionner la frame créée
      figma.currentPage.selection = [frame];
      figma.viewport.scrollAndZoomIntoView([frame]);
      
      figma.notify(`Frame créée avec ${createdCount} styles typographiques`);
      
    } catch (error) {
      console.error('Erreur lors de la création de la frame:', error);
      figma.notify('Erreur lors de la création de la frame: ' + error.message);
    }
  }
};