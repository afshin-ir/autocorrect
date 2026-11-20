const $ = (id) => document.getElementById(id);
const triggerInput = $("trigger");
const replacementInput = $("replacement");
const rowsElement = $("rows");
const searchInput = $("search");
const symbolTriggers = new Set([
  ":_-:", ":_(:", ":_):", ":---:", ":--:", ":-:", ":!:", ":!!:", ":!?:", ":?:",
  ":.:", ":' :".replace(" ", ""), ":/:", ":\\\\:", ":^-:", ":^(:", ":^):", ":<<:", ":>>:",
  "1/2", "1/4", "3/4"
]);
let rules = [];
let editingTrigger = null;

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

function beginEdit(rule) {
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
  $("save").textContent = "افزودن واژه";
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
    rules = await browser.runtime.sendMessage({ type: "autocorrect:get-rules" });
    render();
  } catch {
    showStatus("بارگذاری بانک واژه‌ها ناموفق بود.", true);
  }
})();
