// CopyEnabler - Font decryption module

const CopyEnabler = {
  // Main decryption function
  async decrypt() {
    try {
      GlobalLogger.info('解密复制保护');
      const styleElement = this.findStyleContaining('font-cxsecret');
      if (!styleElement) return;

      const fontMatch = styleElement.textContent.match(/base64,([\w\W]+?)'/);
      if (!fontMatch) return;

      const fontData = Typr.parse(this.base64ToUint8Array(fontMatch[1]))[0];
      
      const tableUrl = chrome.runtime.getURL('assets/table.json');
      const response = await fetch(tableUrl);
      if (!response.ok) return;
      const table = await response.json();
      
      const charMap = this.createCharMap(fontData, table);
      GlobalLogger.success('复制保护已解除');
      this.replaceEncryptedText(charMap);
      
      console.log(`[CX] Decrypted ${Object.keys(charMap).length} chars`);
    } catch (error) {}
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
    document.querySelectorAll('.font-cxsecret').forEach(element => {
      let html = element.innerHTML;
      Object.entries(charMap).forEach(([enc, dec]) => {
        html = html.replace(new RegExp(enc, 'g'), dec);
      });
      element.innerHTML = html;
      element.classList.remove('font-cxsecret');
    });
  }
};
