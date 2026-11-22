const $ = (id) => document.getElementById(id);
const triggerInput = $("trigger");
const replacementInput = $("replacement");
const rowsElement = $("rows");
const searchInput = $("search");
const halfSpaceMiInput = $("half-space-mi");
const halfSpaceHaInput = $("half-space-ha");
const halfSpaceSuffixInput = $("half-space-suffix");
const halfSpaceBiInput = $("half-space-bi");
const halfSpaceComparativeInput = $("half-space-comparative");
const halfSpaceHamInput = $("half-space-ham");
const halfSpaceYaInput = $("half-space-ya");
const rulesToggle = $("rules-toggle");
const rulesContent = $("rules-content");
const ruleInputs = [halfSpaceMiInput, halfSpaceHaInput, halfSpaceSuffixInput, halfSpaceBiInput, halfSpaceComparativeInput, halfSpaceHamInput, halfSpaceYaInput];
const symbolTriggers = new Set([
  ":_-:", ":_(:", ":_):", ":---:", ":--:", ":-:", ":!:", ":!!:", ":!?:", ":?:",
  ":.:", ":':", ":/:", ":\\:", ":^-:", ":^(:", ":^):", ":<<:", ":>>:",
  "1/2", "1/4", "3/4"
]);
let rules = [];
let defaultRules = [];
let suggestionMatches = [];
let activeSuggestionIndex = -1;
let editingTrigger = null;

async function loadDefaultRules() {
  const [dictionaryResponse, bookResponse] = await Promise.all([
    fetch(browser.runtime.getURL("dictionary.json")),
    fetch(browser.runtime.getURL("book-variants.json"))
  ]);
  if (!dictionaryResponse.ok || !bookResponse.ok) throw new Error("خواندن بانک آغازین ناموفق بود.");
  const [dictionary, book] = await Promise.all([dictionaryResponse.json(), bookResponse.json()]);
  const byTrigger = new Map();
  for (const rule of [...(dictionary.rules || []), ...(book.rules || [])]) {
    if (rule && typeof rule.trigger === "string" && typeof rule.replace === "string" && !byTrigger.has(rule.trigger)) {
      byTrigger.set(rule.trigger, rule);
    }
  }
  defaultRules = [...byTrigger.values()].filter((rule) => !(rule.trigger === "ایدئال" && rule.replace === "ایده‌آل"));
}

function hideSuggestions() {
  $("trigger-suggestions").hidden = true;
  triggerInput.setAttribute("aria-expanded", "false");
  triggerInput.removeAttribute("aria-activedescendant");
  activeSuggestionIndex = -1;
}

function selectSuggestion(rule) {
  const currentRule = rules.find((item) => item.trigger === rule.trigger);
  if (currentRule) {
    beginEdit(currentRule);
  } else {
    editingTrigger = null;
    triggerInput.value = rule.trigger;
    replacementInput.value = rule.replace;
    $("save").textContent = "اضافه کن";
    $("cancel-edit").hidden = true;
    replacementInput.focus();
  }
  hideSuggestions();
}

function renderSuggestions() {
  const query = triggerInput.value.trim().toLocaleLowerCase("fa");
  const list = $("trigger-suggestions");
  list.replaceChildren();
  suggestionMatches = [];
  activeSuggestionIndex = -1;
  triggerInput.removeAttribute("aria-activedescendant");

  if (!query) return hideSuggestions();

  suggestionMatches = defaultRules
    .filter((rule) => rule.trigger.toLocaleLowerCase("fa").startsWith(query))
    .slice(0, 8);

  if (suggestionMatches.length === 0) return hideSuggestions();

  suggestionMatches.forEach((rule, index) => {
    const option = document.createElement("button");
    option.type = "button";
    option.id = `trigger-suggestion-${index}`;
    option.className = "word-suggestion";
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");

    const term = document.createElement("span");
    term.className = "word-suggestion-term";
    term.textContent = rule.trigger;
    const detail = document.createElement("span");
    const isExact = rule.trigger.toLocaleLowerCase("fa") === query;
    detail.className = isExact ? "word-suggestion-exact" : "word-suggestion-replacement";
    detail.textContent = isExact ? "از قبل در بانک پیش‌فرض هست" : `تصحیحش کن به: ${rule.replace}`;

    option.append(term, detail);
    option.addEventListener("mousedown", (event) => event.preventDefault());
    option.addEventListener("click", () => selectSuggestion(rule));
    list.append(option);
  });

  list.hidden = false;
  triggerInput.setAttribute("aria-expanded", "true");
}

function moveSuggestionSelection(direction) {
  if (suggestionMatches.length === 0) return;
  activeSuggestionIndex = (activeSuggestionIndex + direction + suggestionMatches.length) % suggestionMatches.length;
  const options = $("trigger-suggestions").querySelectorAll('[role="option"]');
  options.forEach((option, index) => option.setAttribute("aria-selected", String(index === activeSuggestionIndex)));
  const active = options[activeSuggestionIndex];
  triggerInput.setAttribute("aria-activedescendant", active.id);
  active.scrollIntoView({ block: "nearest" });
}

triggerInput.addEventListener("input", renderSuggestions);
triggerInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" && suggestionMatches.length) {
    event.preventDefault();
    moveSuggestionSelection(1);
  } else if (event.key === "ArrowUp" && suggestionMatches.length) {
    event.preventDefault();
    moveSuggestionSelection(-1);
  } else if (event.key === "Enter" && activeSuggestionIndex >= 0) {
    event.preventDefault();
    selectSuggestion(suggestionMatches[activeSuggestionIndex]);
  } else if (event.key === "Escape") {
    hideSuggestions();
  }
});

function showStatus(message, error = false) {
  const status = $("status");
  status.textContent = message;
  status.classList.toggle("error", error);
}

function sortRules() {
  rules.sort((a, b) => {
    const aIsSymbol = symbolTriggers.has(a.trigger);
    const bIsSymbol = symbolTriggers.has(b.trigger);
    if (aIsSymbol !== bIsSymbol) return aIsSymbol ? 1 : -1;
    return a.trigger.localeCompare(b.trigger, "fa");
  });
}

function render() {
  sortRules();
  const query = searchInput.value.trim().toLocaleLowerCase("fa");
  const visible = rules.filter((rule) =>
    `${rule.trigger}\n${rule.replace}`.toLocaleLowerCase("fa").includes(query)
  );
  $("count").textContent = `${rules.length.toLocaleString("fa-IR")} واژه`;
  rowsElement.replaceChildren();
  $("empty").hidden = visible.length !== 0;

  let symbolsHeadingShown = false;
  for (const rule of visible) {
    if (symbolTriggers.has(rule.trigger) && !symbolsHeadingShown) {
      const groupRow = document.createElement("tr");
      groupRow.className = "group-row";
      const heading = document.createElement("th");
      heading.colSpan = 3;
      heading.scope = "rowgroup";
      heading.textContent = "نمادها و کسرها";
      groupRow.append(heading);
      rowsElement.append(groupRow);
      symbolsHeadingShown = true;
    }

    const tr = document.createElement("tr");
    const triggerCell = document.createElement("td");
    const replacementCell = document.createElement("td");
    const actionsCell = document.createElement("td");
    triggerCell.textContent = rule.trigger;
    replacementCell.textContent = rule.replace;
    actionsCell.className = "row-actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "small-button";
    edit.textContent = "ویرایش";
    edit.addEventListener("click", () => beginEdit(rule));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "small-button delete";
    remove.textContent = "حذف";
    remove.addEventListener("click", () => deleteRule(rule.trigger));

    actionsCell.append(edit, remove);
    tr.append(triggerCell, replacementCell, actionsCell);
    rowsElement.append(tr);
  }
}

async function persist() {
  await browser.runtime.sendMessage({ type: "autocorrect:set-rules", rules });
  render();
}

function updateRulesSummary() {
  const enabled = ruleInputs.filter((input) => input.checked).length;
  const disabled = ruleInputs.length - enabled;
  $("rules-summary").textContent = `${enabled.toLocaleString("fa-IR")} قاعده روشن · ${disabled.toLocaleString("fa-IR")} خاموش`;
}

function setRulesExpanded(expanded) {
  rulesToggle.setAttribute("aria-expanded", String(expanded));
  rulesContent.hidden = !expanded;
  $("rules-action-label").textContent = expanded ? "بستن قواعد" : "نمایش قواعد";
}

async function loadRulesPanelState() {
  const settings = await browser.storage.local.get({ rulesPanelExpanded: false });
  setRulesExpanded(settings.rulesPanelExpanded === true);
}

async function saveHalfSpaceSettings() {
  await browser.storage.local.set({
    halfSpaceMiEnabled: halfSpaceMiInput.checked,
    halfSpaceHaEnabled: halfSpaceHaInput.checked,
    halfSpaceSuffixEnabled: halfSpaceSuffixInput.checked,
    halfSpaceBiEnabled: halfSpaceBiInput.checked,
    halfSpaceComparativeEnabled: halfSpaceComparativeInput.checked,
    halfSpaceHamEnabled: halfSpaceHamInput.checked,
    yayeNakerahEnabled: halfSpaceYaInput.checked
  });
  updateRulesSummary();
  showStatus("تنظیمات رسم‌الخط ذخیره شد.");
}

async function loadHalfSpaceSettings() {
  const settings = await browser.storage.local.get({
    halfSpaceMiEnabled: true,
    halfSpaceHaEnabled: true,
    halfSpaceSuffixEnabled: true,
    halfSpaceBiEnabled: true,
    halfSpaceComparativeEnabled: true,
    halfSpaceHamEnabled: true,
    yayeNakerahEnabled: true
  });
  halfSpaceMiInput.checked = settings.halfSpaceMiEnabled !== false;
  halfSpaceHaInput.checked = settings.halfSpaceHaEnabled !== false;
  halfSpaceSuffixInput.checked = settings.halfSpaceSuffixEnabled !== false;
  halfSpaceBiInput.checked = settings.halfSpaceBiEnabled !== false;
  halfSpaceComparativeInput.checked = settings.halfSpaceComparativeEnabled !== false;
  halfSpaceHamInput.checked = settings.halfSpaceHamEnabled !== false;
  halfSpaceYaInput.checked = settings.yayeNakerahEnabled !== false;
  updateRulesSummary();
}

rulesToggle.addEventListener("click", async () => {
  const expanded = rulesToggle.getAttribute("aria-expanded") !== "true";
  setRulesExpanded(expanded);
  try {
    await browser.storage.local.set({ rulesPanelExpanded: expanded });
  } catch {
    showStatus("ذخیرهٔ حالت نمایش قواعد ناموفق بود.", true);
  }
});

function beginEdit(rule) {
  hideSuggestions();
  editingTrigger = rule.trigger;
  triggerInput.value = rule.trigger;
  replacementInput.value = rule.replace;
  $("save").textContent = "ذخیرهٔ تغییر";
  $("cancel-edit").hidden = false;
  triggerInput.focus();
}

function endEdit() {
  editingTrigger = null;
  triggerInput.value = "";
  replacementInput.value = "";
  hideSuggestions();
  $("save").textContent = "اضافه کن";
  $("cancel-edit").hidden = true;
}

async function saveRule() {
  const trigger = triggerInput.value;
  const replace = replacementInput.value;
  if (!trigger.trim()) return showStatus("متنی را که باید جایگزین شود وارد کن.", true);
  if (replace === "") return showStatus("متن جایگزین نمی‌تواند خالی باشد.", true);

  const existing = rules.find((item) => item.trigger === trigger && item.trigger !== editingTrigger);
  if (existing && !confirm(`برای «${trigger}» پیش‌تر یک جایگزین ثبت شده است. آن را جایگزین کنم؟`)) return;
  rules = rules.filter((item) => item.trigger !== editingTrigger && item.trigger !== trigger);
  rules.push({ trigger, replace });
  await persist();
  endEdit();
  showStatus("واژه ذخیره شد.");
}

async function deleteRule(trigger) {
  rules = rules.filter((item) => item.trigger !== trigger);
  await persist();
  showStatus("واژه حذف شد.");
}

function validateRules(data) {
  const source = Array.isArray(data) ? data : data?.rules;
  if (!Array.isArray(source)) throw new Error("ساختار فایل JSON درست نیست؛ باید فهرست rules داشته باشد.");
  const clean = [];
  const seen = new Set();
  for (const item of source) {
    const trigger = item?.trigger;
    const replace = item?.replace ?? item?.replacement;
    if (typeof trigger !== "string" || !trigger.trim() || typeof replace !== "string" || replace === "") continue;
    if (seen.has(trigger)) throw new Error(`عبارت «${trigger}» در فایل چند بار آمده است.`);
    seen.add(trigger);
    clean.push({ trigger, replace });
  }
  return clean;
}

$("save").addEventListener("click", saveRule);
halfSpaceMiInput.addEventListener("change", () => saveHalfSpaceSettings().catch(() => showStatus("ذخیرهٔ تنظیمات ناموفق بود.", true)));
halfSpaceHaInput.addEventListener("change", () => saveHalfSpaceSettings().catch(() => showStatus("ذخیرهٔ تنظیمات ناموفق بود.", true)));
halfSpaceSuffixInput.addEventListener("change", () => saveHalfSpaceSettings().catch(() => showStatus("ذخیرهٔ تنظیمات ناموفق بود.", true)));
halfSpaceBiInput.addEventListener("change", () => saveHalfSpaceSettings().catch(() => showStatus("ذخیرهٔ تنظیمات ناموفق بود.", true)));
halfSpaceComparativeInput.addEventListener("change", () => saveHalfSpaceSettings().catch(() => showStatus("ذخیرهٔ تنظیمات ناموفق بود.", true)));
halfSpaceHamInput.addEventListener("change", () => saveHalfSpaceSettings().catch(() => showStatus("ذخیرهٔ تنظیمات ناموفق بود.", true)));
halfSpaceYaInput.addEventListener("change", () => saveHalfSpaceSettings().catch(() => showStatus("ذخیرهٔ تنظیمات ناموفق بود.", true)));
$("cancel-edit").addEventListener("click", endEdit);
searchInput.addEventListener("input", render);

$("import-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = validateRules(JSON.parse(await file.text()));
    const byTrigger = new Map(rules.map((rule) => [rule.trigger, rule]));
    for (const rule of imported) byTrigger.set(rule.trigger, rule);
    rules = [...byTrigger.values()];
    await persist();
    showStatus(`${imported.length.toLocaleString("fa-IR")} واژه از فایل JSON وارد شد.`);
  } catch (error) {
    showStatus(error.message || "خواندن فایل JSON ناموفق بود.", true);
  } finally {
    event.target.value = "";
  }
});

$("export").addEventListener("click", () => {
  const data = { version: 1, rules };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "autocorrect-fa.json";
  link.click();
  URL.revokeObjectURL(url);
  showStatus("بانک واژه‌ها به‌صورت JSON دریافت شد.");
});

$("reset").addEventListener("click", async () => {
  if (!confirm("بانک فعلی با بانک آغازین افزونه جایگزین شود؟")) return;
  await browser.storage.local.remove("rules");
  rules = await browser.runtime.sendMessage({ type: "autocorrect:get-rules" });
  render();
  showStatus("بانک آغازین بازگردانده شد.");
});

(async () => {
  try {
    await loadRulesPanelState();
    await loadHalfSpaceSettings();
    rules = await browser.runtime.sendMessage({ type: "autocorrect:get-rules" });
    await loadDefaultRules().catch(() => { defaultRules = []; });
    render();
  } catch {
    showStatus("بارگذاری تنظیمات یا بانک واژه‌ها ناموفق بود.", true);
  }
})();

