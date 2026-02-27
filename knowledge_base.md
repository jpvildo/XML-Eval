# Active Knowledge Base: DOCX to XML Conversion Rules

## 1. Headers and Subtitles
* **Splitting:** Standard headers must be split logically. The section number goes in `<h1>` and the title goes in `<p data-type="subtitle">`. 
  * *Note:* The parser must accurately split headers even if the section number contains letters (e.g., "Sec. 11A").
* **Requirement Rules:** Content is required in `<h1>` elements, but `<p data-type="subtitle">` is optional. 
  * *Exception:* The `<section data-type="preliminaries">` header can (and should) have an empty `<h1></h1>` tag.
* **Subtitle Restriction:** `<p data-type="subtitle">` is STRICTLY reserved as a direct child of `<header>`. It cannot be used for standard body text.
* **Abbreviation Overrides:** If a subtitle is very long, the `<section>` element should include a `data-abbrev="..."` attribute containing the shortened title for TOCs and PDF bookmarks.
* **No Hallucinations:** The converter must not fabricate wrapper headers. If a division lacks a header in the DOCX, do not invent one.

## 2. Structural Hierarchy & Data-Types
* **Standard Hierarchy:** Sections can be deeply nested in the following order: `part` > `article` > `chapter` > `division` > `subdivision` > `section`. 
* **Section Priority:** `<section data-type="section">` (representing true code of ordinances sections) must remain the most detailed heading level, regardless of its parent wrapper.
* **Special Data-Types:** Recognize and apply specific data-types for front/back matter sections: `preliminaries`, `officialscurrent`, `officialsoriginal`, `preface`, `adoptingord`, `supphistory`, `charter`, `index`, and `cct`.
* **XML Prolog:** Root section elements must contain standard namespace declarations (`xmlns:xi`, `xmlns:xlink`, `xmlns:xs`, `xmlns`).

## 3. Footnotes and Asides
* **Placement is Contextual:** Footnotes (`<aside class="footnote" id="...">`) must be placed immediately following the block element containing their reference (`<span data-fnref="...">`).
  * *Header Reference:* If attached to a subtitle, the `<aside>` MUST be placed immediately *after* the closing `</header>` tag.
  * *Inline Reference:* If inside a paragraph, the `<aside>` MUST be placed immediately *after* the closing `</p>` tag of that paragraph.
  * *Table Reference:* If inside a table cell, the `<aside>` MUST be placed immediately *after* the closing `</table>` tag.

## 4. Semantic Typography (Italics/Bolding/Alignment)
* **`<dfn>`:** Used STRICTLY for the primary defined term in a Definitions section. 
* **`<span class="title">`:** Used for list item catchphrases or run-in headers at the start of a list item.
* **`<em>` or `<b>`:** Used for standard emphasis within regular text.
* **Paragraph Classes:** Standard text elements use classed hierarchies from level 1 to 9 (e.g., `p1`, `b1`, `hg1` up to `p9`, `b9`, `hg9`). *There is no level 0.*
* **Alignment:** Use `<p class="center">` for centered text.

## 5. Lists
* **Unordered/Bullet Lists:** Bulleted lists use the standard ordered list class (e.g., `<p class="ol1">`) but must place the bullet character inside the incrementor: `<span class="incr">•</span>`.
* **Standard Ordered Lists:** Follow specific class hierarchies (`ol1`, `ol2`). List numbers/letters must be wrapped in `<span class="incr">`.
* **Multi-Lists:** For lists that combine incrementors (e.g., "g.(i)"), use the multi-list class (e.g., `<p class="ml3">`). These require dual incrementor spans: `<span class="incr">g.</span>` followed by `<span class="incrml">(i)</span>`.
* **Text:** The text content of all list items must be wrapped in `<span class="li">`.

## 6. Images and Figures
* **Figure Wrapper:** Images must be wrapped in a `<figure class="center" id="...">` block.
* **Captions:** Captions belong inside a `<figcaption>` tag. The title text of the caption should be wrapped in `<strong>`.
* **Image Attributes:** The `<img>` tag must contain `id`, `class`, `src`, `width`, and `height` attributes.

## 7. Oxygen Tracked Changes (<?oxy_...?>)
* **Header Splitting:** Oxygen tags must not break the logic of header splitting. If a header is wrapped in a `<?oxy_delete>` or `<?oxy_insert>` tag, the parser must accurately split the text into `<h1>` and `subtitle` *without duplicating* the tracked string in both places.
* **Comments:** Oxygen comments (`<?oxy_comment_start?>`) must be kept inline but must not force regular body text into header tags.

## 8. Legislative History and References
* **History Notes:** Parenthetical history strings must be parsed into their own `<p data-type="historynote">` tags. 
* **State Laws:** References to state laws must be tagged `<p data-type="refstatelaw">`.
* **Charters:** References to Charters must be tagged `<p data-type="refcharter">`.
* **General References:** General cross-references must be tagged `<p data-type="crossreference">` (or `<p data-type="refeditor">`).

## 9. Tables
* **Column Groups:** Empty `<colgroup>` elements containing `<col width="...">` tags without text data are correct and expected.
* **Headers:** Table headers (`<thead>`) should ideally use `<th>` tags rather than standard `<td>` tags.
