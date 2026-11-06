# Product

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
Existing Next.js App Router / React / TypeScript workspace. Preserve the stack and current data and authentication contracts.

## Users
Readers seeking clear Chinese explanations of AI research papers, with video, follow-up questions and personal notes. This use is established by the user's reading-site brief in this conversation; no business audience is claimed.

## Product Purpose
A research reading site that introduces itself on the homepage and supports uninterrupted, comprehensible reading of real papers.

## Operating Context
The existing local site runs at localhost:3000. Public-facing routes are authenticated. The reading station includes home, library, videos, research directions and detail pages, monthly reports and detail pages, and archive. Administration is a separate workspace.

## Capabilities and Constraints
- Preserve existing published papers, article revisions, videos, notes, authentication and backend operations.
- The homepage introduces the site rather than showing a to-read queue.
- The library has no search, favorites, read-state or not-interested controls. Do not reintroduce them.
- Paper introductions show why the paper matters and the video by default. The source metadata can be opened on demand.
- Papers and monthly reports share one reading workspace. The top floating site navigation is hidden on reading pages; the article title remains. Desktop readers keep the directory adjacent to the article on its left, without a directory button; the article itself is centred when space permits. Assistant, notes and paper/report information share one panel with left/right docking, a movable/resizable floating window and fullscreen. Their buttons float above content at stable positions; only the chat composer reserves space for them. A return-to-top button scrolls the article. The panel opens from the lower-right launcher with a 360ms spring and collapses in 260ms; reduced motion disables both animations. Alternate original papers appear in paper information. Docking preserves the visible reading block; drafts and requests survive view changes. Browser preferences remember only dock width and floating dimensions, discarding historical modes and coordinates. Every reopening defaults to right docking, with temporary floating only when the viewport is too narrow. Entering either kind of document starts with the operation panel closed.
- Preserve multiple conversations, per-conversation drafts, history, renaming, deletion confirmation, answers saved as notes and orphaned section notes. Panel scrollbars use a separate right-edge lane, with enough trailing scroll space to reveal the final line above the floating tools. Note save actions stay on the left. Tooltips use bordered speech bubbles on hover and keyboard focus; six native 24px SVG icons share rounded 1.7px strokes. Notes use one directly editable rendered Markdown/math/table/code surface with a small editable source toggle; there are no split or preview modes. Reports keep notes and conversations isolated by month.
- Prioritize desktop; this reader-panel change preserves the existing mobile overlay without adding mobile layout work.
- Do not publish a new interpretation or enable a new writing requirement as a side effect of a style change.

## Brand Commitments
Name: 论文精读. Chinese interface. The user requested Apple-like clarity, whitespace and refinement, then rejected both the heavy centered slogan and the pale green / thin-type rendition. These rejected implementations are anti-references, not a binding palette or brand.

## Evidence on Hand
Real paper content and original figures are supplied by the existing library, including paper 2610.22200. Actual video and monthly report data are available through existing data helpers. Do not invent reader counts, testimonials, paper claims, benchmark results or additional publications.

## Product Principles
- Clear hierarchy and readable prose.
- Real research material leads the page.
- Minimize unnecessary slogans, explanatory labels and decoration.
- Preserve reader control and working behavior across a visual replacement.

## Source of Confirmation
The user's detailed implementation plan and subsequent corrections in this conversation establish these facts. The user explicitly delegated design decisions and requested an overall redesign using the installed skills; no unconfirmed brand colors or commercial positioning are added here.
