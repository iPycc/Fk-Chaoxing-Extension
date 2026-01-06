// CopyEnabler - Font decryption module

const CopyEnabler = {
  // Main decryption function
  async decrypt() {
    try {
      // GlobalLogger.info('Starting font decryption');
      
      const styleElement = this.findStyleContaining('font-cxsecret');
      if (!styleElement) {
        // GlobalLogger.info('No encrypted fonts found');
        return;
      }

      const fontMatch = styleElement.textContent.match(/base64,([\w\W]+?)'/);
      if (!fontMatch) {
        // GlobalLogger.warning('Encrypted font style found but no base64 data');
        return;
      }

      const fontData = Typr.parse(this.base64ToUint8Array(fontMatch[1]))[0];
      
      const tableUrl = chrome.runtime.getURL('assets/table.json');
      const response = await fetch(tableUrl);
      if (!response.ok) {
        throw new Error('Failed to load mapping table');
      }
      const table = await response.json();
      
      const charMap = this.createCharMap(fontData, table);
      const count = Object.keys(charMap).length;
      
      // GlobalLogger.info('Font map created', `Mapped ${count} characters`);
      
      const replacedCount = this.replaceEncryptedText(charMap);
      
      GlobalLogger.success(`已解密 ${count} 个字体文件，替换 ${replacedCount} 处文本`);

    } catch (error) {
      GlobalLogger.error('字体解密失败', error.message);
    }
  },

  // Find style element containing text
  findStyleContaining(text) {
    return Array.from(document.querySelectorAll('style')).find(s => s.textContent.includes(text)) || null;
  },

  // Convert base64 to Uint8Array
  base64ToUint8Array(base64) {
    const data = window.atob(base64);
    return new Uint8Array([...data].map(char => char.charCodeAt(0)));
  },

  // Create char mapping from font and table
  createCharMap(font, table) {
    const charMap = {};
    for (let i = 19968; i < 40870; i++) {
      const glyph = Typr.U.codeToGlyph(font, i);
      if (!glyph) continue;
      const path = Typr.U.glyphToPath(font, glyph);
      const pathHash = md5(JSON.stringify(path)).slice(24);
      if (table[pathHash]) {
        charMap[String.fromCharCode(i)] = String.fromCharCode(table[pathHash]);
      }
    }
    return charMap;
  },

  // Replace encrypted text in elements
  replaceEncryptedText(charMap) {
    const elements = document.querySelectorAll('.font-cxsecret');
    let count = 0;
    
    elements.forEach(element => {
      let html = element.innerHTML;
      Object.entries(charMap).forEach(([enc, dec]) => {
        html = html.replace(new RegExp(enc, 'g'), dec);
      });
      element.innerHTML = html;
      element.classList.remove('font-cxsecret');
      count++;
    });
    
    return count;
  }
};
