let initialRulesPromise;
let bookVariantMigrationPromise;
const CURRENT_BOOK_VARIANTS_VERSION = 1;

function removeIncorrectIdealRule(rules) {
  return rules.filter((rule) => !(rule?.trigger === "ایدئال" && rule?.replace === "ایده‌آل"));
}

async function loadBookVariants() {
  const response = await fetch(browser.runtime.getURL("book-variants.json"));
  if (!response.ok) throw new Error("خواندن واژه‌های کتاب ناموفق بود.");
  return response.json();
}

async function loadInitialRules() {
  const [dictionaryResponse, bookData] = await Promise.all([
    fetch(browser.runtime.getURL("dictionary.json")),
    loadBookVariants()
  ]);
  if (!dictionaryResponse.ok) throw new Error("خواندن بانک آغازین ناموفق بود.");
  const dictionaryData = await dictionaryResponse.json();
  const rulesByTrigger = new Map();
  for (const rule of [...(dictionaryData.rules || []), ...(bookData.rules || [])]) {
    if (rule && typeof rule.trigger === "string" && typeof rule.replace === "string" && !rulesByTrigger.has(rule.trigger)) {
      rulesByTrigger.set(rule.trigger, rule);
    }
  }
  return { rules: removeIncorrectIdealRule([...rulesByTrigger.values()]), bookVersion: bookData.version || 1 };
}

async function migrateBookVariants(storedRules, bookVersion) {
  const bookData = await loadBookVariants();
  const rulesByTrigger = new Map(storedRules.map((rule) => [rule.trigger, rule]));
  for (const rule of bookData.rules || []) {
    if (rule && typeof rule.trigger === "string" && typeof rule.replace === "string" && !rulesByTrigger.has(rule.trigger)) {
      rulesByTrigger.set(rule.trigger, rule);
    }
  }
  const rules = removeIncorrectIdealRule([...rulesByTrigger.values()]);
  await browser.storage.local.set({ rules, bookVariantsVersion: bookData.version || bookVersion || 1 });
  return rules;
}

async function ensureRules() {
  const stored = await browser.storage.local.get(["rules", "bookVariantsVersion"]);
  if (Array.isArray(stored.rules)) {
    if ((stored.bookVariantsVersion || 0) < CURRENT_BOOK_VARIANTS_VERSION) {
      if (!bookVariantMigrationPromise) {
        bookVariantMigrationPromise = migrateBookVariants(stored.rules, stored.bookVariantsVersion || 0)
          .finally(() => { bookVariantMigrationPromise = null; });
      }
      return bookVariantMigrationPromise;
    }
    const rules = removeIncorrectIdealRule(stored.rules);
    if (rules.length !== stored.rules.length) {
      await browser.storage.local.set({ rules });
    }
    return rules;
  }

  if (!initialRulesPromise) {
    initialRulesPromise = loadInitialRules()
      .then(async ({ rules, bookVersion }) => {
        await browser.storage.local.set({ rules, bookVariantsVersion: bookVersion });
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
