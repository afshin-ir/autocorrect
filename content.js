(() => {
  let rules = [];
  let rulesReady = false;

  browser.runtime.sendMessage({ type: "autocorrect:get-rules" })
    .then((result) => {
      rules = normalizeRules(result);
      rulesReady = true;
    })
    .catch(() => {});

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.rules) {
      rules = normalizeRules(changes.rules.newValue);
      rulesReady = true;
    }
  });

  function normalizeRules(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item) => item && typeof item.trigger === "string" && item.trigger.length && typeof item.replace === "string")
      .slice()
      .sort((a, b) => b.trigger.length - a.trigger.length);
  }

  function isWordCharacter(char) {
    return Boolean(char && /[\p{L}\p{N}_]/u.test(char));
  }

  function findMatch(text) {
    for (const rule of rules) {
      if (!text.endsWith(rule.trigger)) continue;
      const start = text.length - rule.trigger.length;
      const first = [...rule.trigger][0] || "";
      const previous = [...text.slice(0, start)].pop() || "";
      if (isWordCharacter(first) && isWordCharacter(previous)) continue;
      return { rule, start };
    }
    return null;
  }

  function isDelimiter(event) {
    return event.key === "Enter" || /^[\s.,;:!?()[\]{}'"…،؛؟]$/u.test(event.key);
  }

  function onKeydown(event) {
    if (!rulesReady || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || !isDelimiter(event)) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.isContentEditable) {
      replaceInEditable(target);
      return;
    }
    if (target instanceof HTMLTextAreaElement) {
      replaceInInput(target);
      return;
    }
    if (target instanceof HTMLInputElement) {
      const type = (target.type || "text").toLowerCase();
      if (!["text", "search", "tel"].includes(type)) return;
      replaceInInput(target);
    }
  }

  function replaceInInput(input) {
    if (input.readOnly || input.disabled || input.selectionStart === null || input.selectionEnd === null) return;
    if (input.selectionStart !== input.selectionEnd) return;
    const caret = input.selectionStart;
    const match = findMatch(input.value.slice(0, caret));
    if (!match) return;
    const start = caret - match.rule.trigger.length;
    input.setRangeText(match.rule.replace, start, caret, "end");
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertReplacementText",
      data: match.rule.replace
    }));
  }

  function replaceInEditable(target) {
    if (!(target instanceof HTMLElement)) return;
    const editor = target.closest('[contenteditable="true"], [contenteditable=""]') ||
      (target.isContentEditable ? target : null);
    if (!editor) return;

    const selection = document.getSelection();
    if (!selection || !selection.isCollapsed || !selection.anchorNode || !editor.contains(selection.anchorNode)) return;

    const beforeCaret = document.createRange();
    beforeCaret.selectNodeContents(editor);
    beforeCaret.setEnd(selection.anchorNode, selection.anchorOffset);
    const text = beforeCaret.toString();
    const match = findMatch(text);
    if (!match) return;

    const startPoint = pointAtTextOffset(editor, match.start);
    if (!startPoint) return;

    const replacementRange = document.createRange();
    replacementRange.setStart(startPoint.node, startPoint.offset);
    replacementRange.setEnd(selection.anchorNode, selection.anchorOffset);
    replacementRange.deleteContents();
    const inserted = document.createTextNode(match.rule.replace);
    replacementRange.insertNode(inserted);
    replacementRange.setStartAfter(inserted);
    replacementRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(replacementRange);
    editor.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertReplacementText",
      data: match.rule.replace
    }));
  }

  function pointAtTextOffset(root, offset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let remaining = offset;
    let node;
    while ((node = walker.nextNode())) {
      const length = node.nodeValue.length;
      if (remaining <= length) return { node, offset: remaining };
      remaining -= length;
    }
    return null;
  }

  document.addEventListener("keydown", onKeydown, true);
})();
