let initialRulesPromise;

async function ensureRules() {
  const stored = await browser.storage.local.get("rules");
  if (Array.isArray(stored.rules)) return stored.rules;

  if (!initialRulesPromise) {
    initialRulesPromise = fetch(browser.runtime.getURL("dictionary.json"))
      .then((response) => {
        if (!response.ok) throw new Error("خواندن بانک آغازین ناموفق بود.");
        return response.json();
      })
      .then(async (data) => {
        const rules = Array.isArray(data.rules) ? data.rules : [];
        await browser.storage.local.set({ rules });
        return rules;
      });
  }
  return initialRulesPromise;
}

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "autocorrect:get-rules") return ensureRules();
  if (message?.type === "autocorrect:set-rules" && Array.isArray(message.rules)) {
    return browser.storage.local.set({ rules: message.rules });
  }
  return undefined;
});

browser.action.onClicked.addListener(() => browser.runtime.openOptionsPage());
