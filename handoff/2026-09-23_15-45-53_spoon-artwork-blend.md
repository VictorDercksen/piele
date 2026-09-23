# Spoon artwork blending

Request: Remove the visible rectangular edges around the Spoon-and-beer image and blend it into the wood card.

Completed: Updated apps/web/src/styles/ui.scss only. Removed the compact artwork strip's solid fill and divider borders. Render the existing photo in a size-bounded pseudo-element with intersecting horizontal and vertical gradient masks, fading all four photo edges into the underlying timber. Applied to wide cards, compact cards and evidence dialogs. No image asset changes or new generation.

Verification: Production build passed without warnings. Browser screenshots checked for duty cards at 1800, 1280, 390 and 320px and the evidence dialog, with no horizontal overflow. Desktop and compact card screenshots and the dialog were visually reviewed. No logic changed, so unit and full journey tests were not rerun.

No unresolved issues. Dev server remains at localhost:4300. No commit or deployment.
