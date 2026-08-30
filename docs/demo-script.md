# Demo Video Script — target 2:35

The final recording must be under three minutes, in English, with audible narration. Record at 1440×900 or higher in ChatGPT Desktop's in-app browser or Chrome 149+ with WebMCP enabled.

## 0:00–0:18 — Problem and product

**On screen:** Full workbench, header and complete corpus count.

**Narration:**

> Structured invoice XML is precise, consequential, and miserable to operate through visual automation. PrzedWysylka WebMCP Lab gives a human and a browser agent one shared, browser-local FA(3) workspace.

Point out:

- 36 locked official assets;
- 30 XML and six XSD source records;
- browser-local status;
- six WebMCP tools live.

## 0:18–0:38 — First-party corpus and integrity

**On screen:** Search/filter the corpus; select the canonical root XSD, then return to the CIRFMF base template.

**Narration:**

> This is not a hand-picked demo fixture. The repository contains every XML from the Ministry's official FA(3) example archive, all CIRFMF templates we froze, and the complete transitive CRD schema closure. Every source record is SHA-256 locked with its upstream provenance.

## 0:38–1:02 — Ask the agent

**Prompt:**

> Open the base FA(3) template, validate it, then stage exact replacements for its two placeholders. Do not approve them.

**Narration while tools run:**

> The agent discovers structured page tools instead of scraping controls. It selects the official template and runs the same canonical browser-local validator the UI uses.

Show the `Needs attention` finding for `#nip#`.

## 1:02–1:32 — Agent stages, but cannot apply

**On screen:** Pending proposal with two replacement cards and diff.

**Narration:**

> The agent reads only the source range it needs and stages two exact replacements. Notice that Revision zero is still unchanged. The agent has no approval tool—this is enforced by the capability surface, not by asking the model to behave.

Briefly show the six tool chips; emphasize that none is named approve/apply/download.

## 1:32–1:55 — Human authority

**On screen:** Click `Approve changes` manually.

**Narration:**

> I approve in the human interface. That creates Revision one and automatically revalidates it against the four-file canonical CRD closure.

Wait for `Schema valid`.

## 1:55–2:18 — Shared evidence

**On screen:** Audit trail and provenance.

**Narration:**

> The audit trail preserves selection, failed validation, staging, human approval, and the valid new revision. Provenance shows the original source URL, role, namespace, and byte hash. Nothing is sent to an application backend.

## 2:18–2:35 — Close

**On screen:** Return to full workbench.

**Narration:**

> WebMCP makes the agent faster and more reliable without removing the web interface or the person responsible for the document. The agent does the mechanical work. The human remains the authority.

## Recording checklist

- Keep the recording under 3:00; target 2:35.
- Use only the bundled official fixtures; show no personal/customer XML.
- Show the WebMCP connected state.
- Confirm the connected state comes from the target browser's native `document.modelContext` implementation.
- Do not inject the automated WebMCP harness into the final recording; this recording is the manual native-browser smoke.
- Do not cut between staging and approval; the human click must be visible.
- Ensure narration is English and no copyrighted music plays.
- Review the final video for personal information, notifications, bookmarks, and unrelated trademarks before publishing.
