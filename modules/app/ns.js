// Shared namespace for classic Manifest V3 content scripts.
globalThis.FK = globalThis.FK || {};
FK.app = FK.app || {};
FK.question = FK.question || { model: {}, scan: {}, parse: {}, service: {} };
FK.ai = FK.ai || { config: {}, net: {}, answer: {}, chat: {}, fill: {} };
FK.runtime = FK.runtime || Object.freeze({
  protocol: 2,
  version: chrome.runtime.getManifest().version
});
