# Demo video script (target 2:35)

The final recording must be under three minutes, in English, with audible narration.[6] Record at 1440×900 or higher in the current ChatGPT Desktop built-in browser. Use GPT-5.6 Sol or GPT-5.6 Terra; GPT-5.6 Luna currently has WebMCP disabled.[5]

**Live URL:** https://przedwysylka-webmcp-lab-greqone.netlify.app/

## Recording setup

1. Make the GitHub repository public and confirm the MIT license appears in its About panel.
2. Open the live URL in a signed-out ordinary browser and confirm it needs no credentials.
3. Update ChatGPT Desktop, select GPT-5.6 Sol or GPT-5.6 Terra, open the live URL in the built-in browser, and confirm `Site tools` lists exactly six tools.
4. Hard-reload the page so the recording starts at Revision 0 with no pending proposal.
5. Record at 1440×1050 when possible. Hide notifications, bookmarks, unrelated tabs, account details, and desktop clutter.
6. Rehearse once, then start a fresh page for the final take. Do not splice the proposal proof and manual approval click.

## 0:00–0:18 — Problem and product

**On screen:** Full workbench, header and complete corpus count.

**Narration:**

> One bad value can invalidate a structured invoice. PrzedWysylka WebMCP Lab gives a person and a browser agent the same official FA(3) source, canonical validator, pending diff, and audit trail.

Point out:

- 55 locked official assets;
- 45 XML and 10 XSD source records;
- browser-local status;
- six WebMCP tools live.

Open `Site tools` and briefly show exactly six available tools. Keep the app and agent visible together.

## 0:18–0:38 — First-party corpus and integrity

**On screen:** Search/filter the corpus; select the canonical root XSD, then return to the CIRFMF base template.

**Narration:**

> This is not a hand-picked demo fixture. The repository contains every XML from the Ministry's official FA(3) archive, every FA(3)-namespace XML path from the pinned CIRFMF C#, Java, and PDF-generator snapshots, and every scoped FA(3) XSD source record. All 55 records are byte-locked with upstream provenance.

## 0:38–1:08 — Ask the agent and expose the bad revision

**Prompt:**

> Open the base FA(3) template, validate it, then stage exact replacements for its two placeholders. Validate the pending proposal, but do not approve it.

**Narration while tools run:**

> The agent discovers structured page tools instead of scraping controls. It selects the official template and validates the current approved draft against the same canonical schema closure used by the UI.

Show `Current approved revision`, Revision 0, `Needs attention`, and the finding for `#nip#`. Hold long enough for the scope to be readable.

## 1:08–1:43 — Agent proposes and schema proves

**On screen:** Pending proposal with two replacement cards, diff, and preflight state.

**Narration:**

> The agent reads only the source range it needs and stages two exact replacements. Revision zero is still unchanged, and approval is disabled. The agent now validates the pending proposal itself.

Wait for `Schema valid before approval`. Point to zero findings and the visible SHA-256 prefix. Then show the enabled approval button and the six tool chips; none is an approve, apply, reject, or download tool.

## 1:43–2:03 — Human authority

**On screen:** Keep the proposal proof and buttons visible. Click `Approve changes` manually. Do not cut between proof and click.

**Narration:**

> The schema proof makes this proposal eligible for review, but it does not apply anything. I approve in the human interface. That creates Revision one and validates the approved bytes again against the four-file canonical CRD closure.

Wait for `Schema valid`.

## 2:03–2:22 — Shared evidence

**On screen:** Audit trail and provenance.

**Narration:**

> The audit trail separates the failed Revision zero validation, proposal preflight, staging, human approval, and valid Revision one. Provenance keeps the original source URL, namespace, and byte hash. Nothing is sent to an application backend.

## 2:22–2:35 — Close

**On screen:** Return to full workbench.

**Narration:**

> WebMCP removes brittle UI guessing without removing the interface or the person responsible for the document. The agent proposes. The schema proves. The human approves.

## Recording checklist

- Keep the recording under 3:00; target 2:35.
- Use only the bundled official fixtures; show no personal/customer XML.
- Use current ChatGPT Desktop with GPT-5.6 Sol or GPT-5.6 Terra.
- Show `Site tools`, all six available tools, and the WebMCP connected state.
- Confirm the connected state comes from the target browser's native `document.modelContext` implementation.
- Run `npm run smoke:native` under Node `22.22.2` before recording and confirm evidence schema version 2 binds the current production artifact, corpus inputs, screenshot, and proposal-to-draft hash chain.
- Keep Revision 0 invalidity, proposal SHA-256 proof, and the enabled human controls legible.
- Do not inject the automated WebMCP harness into the final recording; this recording is the manual native-browser smoke.
- Do not cut between proposal preflight and approval; the human click must be visible.
- Ensure narration is English and no copyrighted music plays.
- Review the final video for personal information, notifications, bookmarks, and unrelated trademarks before publishing.

## YouTube package

**Title:** PrzedWysylka WebMCP Lab — Agent proposes, schema proves, human approves

**Description:**

> PrzedWysylka WebMCP Lab is a browser-local FA(3) XML workbench built for the WebMCP Challenge. A browser agent uses six page-native tools to inspect official sources, validate Revision 0, stage two exact replacements, and validate the pending bytes. Approval remains a visible UI action. The final Revision 1 is validated again against the canonical schema closure.
>
> Live demo: https://przedwysylka-webmcp-lab-greqone.netlify.app/
>
> Source: https://github.com/greqone/PrzedWysylkaWebMCPLab

**Thumbnail:** use `docs/assets/native-workbench.png` or a clean frame showing `Schema valid before approval` and the enabled `Approve changes` button.

**Visibility:** Public. Confirm the public watch URL in a signed-out browser before adding it to Devpost.

## Sources

[5] https://learn.chatgpt.com/docs/webmcp
[6] https://webmcp.devpost.com/rules
