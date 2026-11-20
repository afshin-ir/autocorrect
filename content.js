(() => {
  let rules = [];
  let rulesReady = false;
  let halfSpaceSettingsReady = false;
  const halfSpaceSettings = { mi: true, ha: true, suffix: true };
  const halfSpaceExceptions = new Set(["تنها", "رها", "بها", "آها", "مها"]);

  browser.runtime.sendMessage({ type: "autocorrect:get-rules" })
    .then((result) => {
      rules = normalizeRules(result);
      rulesReady = true;
    })
    .catch(() => {});

  browser.storage.local.get({
    halfSpaceMiEnabled: true,
    halfSpaceHaEnabled: true,
    halfSpaceSuffixEnabled: true
  }).then((settings) => {
    halfSpaceSettings.mi = settings.halfSpaceMiEnabled !== false;
    halfSpaceSettings.ha = settings.halfSpaceHaEnabled !== false;
    halfSpaceSettings.suffix = settings.halfSpaceSuffixEnabled !== false;
    halfSpaceSettingsReady = true;
  }).catch(() => {
    halfSpaceSettingsReady = true;
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.rules) {
      rules = normalizeRules(changes.rules.newValue);
      rulesReady = true;
    }
    if (changes.halfSpaceMiEnabled) {
      halfSpaceSettings.mi = changes.halfSpaceMiEnabled.newValue !== false;
    }
    if (changes.halfSpaceHaEnabled) {
      halfSpaceSettings.ha = changes.halfSpaceHaEnabled.newValue !== false;
    }
    if (changes.halfSpaceSuffixEnabled) {
      halfSpaceSettings.suffix = changes.halfSpaceSuffixEnabled.newValue !== false;
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

  function findHalfSpaceMatch(text) {
    if (halfSpaceSettings.mi) {
      const prefixMatch = /(^|[^\p{L}\p{M}\p{N}_])(نمی|می) +([\p{L}\p{M}\u200c]+)$/u.exec(text);
      if (prefixMatch) {
        const start = prefixMatch.index + prefixMatch[1].length;
        return {
          start,
          end: text.length,
          replace: prefixMatch[2] + "\u200c" + prefixMatch[3]
        };
      }
    }

    if (halfSpaceSettings.ha) {
      if (text.endsWith("\u200cها")) return null;

      const spacedMatch = /(^|[^\p{L}\p{M}\p{N}_])([\p{L}\p{M}\u200c]+) +ها$/u.exec(text);
      if (spacedMatch) {
        const stem = spacedMatch[2].replace(/\u200c+$/u, "");
        const start = spacedMatch.index + spacedMatch[1].length;
        return { start, end: text.length, replace: stem + "\u200cها" };
      }

      const attachedMatch = /(^|[^\p{L}\p{M}\p{N}_])([\p{L}\p{M}\u200c]+)ها$/u.exec(text);
      if (attachedMatch) {
        const wholeWord = attachedMatch[2] + "ها";
        if (halfSpaceExceptions.has(wholeWord)) return null;
        const stem = attachedMatch[2].replace(/\u200c+$/u, "");
        const start = attachedMatch.index + attachedMatch[1].length;
        return { start, end: text.length, replace: stem + "\u200cها" };
      }
    }

    if (halfSpaceSettings.suffix) {
      if (/\\u200c(?:ام|ایم|اید|اند)$/u.test(text)) return null;

      const spacedSuffixMatch = /(^|[^\\p{L}\\p{M}\\p{N}_])([\\p{L}\\p{M}\\u200c]+ه) +(ام|ایم|اید|اند)$/u.exec(text);
      if (spacedSuffixMatch) {
        const stem = spacedSuffixMatch[2].replace(/\\u200c+$/u, "");
        const start = spacedSuffixMatch.index + spacedSuffixMatch[1].length;
        return { start, end: text.length, replace: stem + "\\u200c" + spacedSuffixMatch[3] };
      }

      const attachedSuffixMatch = /(^|[^\\p{L}\\p{M}\\p{N}_])([\\p{L}\\p{M}\\u200c]+ه)(ام|ایم|اید|اند)$/u.exec(text);
      if (attachedSuffixMatch) {
        const stem = attachedSuffixMatch[2].replace(/\\u200c+$/u, "");
        const start = attachedSuffixMatch.index + attachedSuffixMatch[1].length;
        return { start, end: text.length, replace: stem + "\\u200c" + attachedSuffixMatch[3] };
      }
    }

    return null;
  }

  function findCorrection(text) {
    const exactMatch = findMatch(text);
    if (exactMatch) {
      return {
        start: exactMatch.start,
        end: text.length,
        replace: exactMatch.rule.replace
      };
    }
    return findHalfSpaceMatch(text);
  }

  function isDelimiter(event) {
    return event.key === "Enter" || /^[\s.,;:!?()[\]{}'"…،؛؟]$/u.test(event.key);
  }

  function onKeydown(event) {
    if (!rulesReady || !halfSpaceSettingsReady || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || !isDelimiter(event)) return;
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
    const correction = findCorrection(input.value.slice(0, caret));
    if (!correction) return;
    input.setRangeText(correction.replace, correction.start, correction.end, "end");
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertReplacementText",
      data: correction.replace
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
    const correction = findCorrection(text);
    if (!correction) return;

    const startPoint = pointAtTextOffset(editor, correction.start);
    if (!startPoint) return;

    const replacementRange = document.createRange();
    replacementRange.setStart(startPoint.node, startPoint.offset);
    replacementRange.setEnd(selection.anchorNode, selection.anchorOffset);
    replacementRange.deleteContents();
    const inserted = document.createTextNode(correction.replace);
    replacementRange.insertNode(inserted);
    replacementRange.setStartAfter(inserted);
    replacementRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(replacementRange);
    editor.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertReplacementText",
      data: correction.replace
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
