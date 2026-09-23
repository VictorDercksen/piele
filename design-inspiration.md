# Rugby design exploration, revision 2

Mobbin references were inspected through the Mobbin MCP. These inform composition and hierarchy. No reference screenshots or brand assets were copied into the application.

- [Fixtured match poster](https://mobbin.com/screens/fb82aeac-7fa1-40c5-976a-daa9f5a56be3): prominent matchup, strong typography and a fixture-first structure.
- [MLS home](https://mobbin.com/screens/3fcac024-96e4-49ba-b47d-82d772364bda): compact fixture strip and imagery carrying the sport identity.
- [The Performance Lab](https://mobbin.com/sites/sections/abf8940e-4964-4058-8cc8-4ab89f147c70): oversized type alongside action photography.

O1 Club Journal is a printed match programme with a monochrome cover, serif editorial headings, fixture tickets and duty slips. O2 Floodlights is a broadcast treatment with a full-width action image and an interactive fixture strip. O3 Matchday is a team sheet built from the supplied jerseys, rugby pitch lines and numbered navigation.

## Round navigation

The shared season timeline draws on [FotMob's date selector](https://mobbin.com/screens/63822eb3-04ec-42a9-80f7-fb90180c65ae) and [Fixtured's chronological fixture list](https://mobbin.com/screens/cd293522-a380-4fd9-a905-3e899c137cce), inspected through Mobbin MCP. Desktop uses a vertical season rail. Mobile uses a horizontal strip and a round picker. The selected round scopes fixtures, results, standings, duties, decisions and review queues in all three directions. Constitution content remains explicitly season-wide.

Rounds 1–4 contain illustrative completed, review, current and upcoming states. Later rounds show unscheduled states. Selection persists in the URL as `round`, including across design changes and refreshes. Sample votes and evidence status are kept separately for each round during the preview session.

## Original artwork

Generated with the built-in image generation tool. This depicts a fictional match and is labelled illustrative in the previews. It is not photography of an actual URC fixture.

- Source: `apps/web/public/assets/editorial/rugby-under-lights.png`
- Web asset: `apps/web/public/assets/editorial/rugby-under-lights.webp`
- The WebP is a format conversion at quality 88. The journal's monochrome treatment is CSS.

Final generation prompt:

> Use case: photorealistic-natural. Asset type: original rugby action photography for a private rugby club web application. Create one cinematic editorial sports photograph, wide landscape aspect ratio approximately 3:2. Scene: a rain-soaked evening rugby union match in a small South African club stadium under tall floodlights, blurred packed stand, dramatic fine rain and mist. Subject: in the right two thirds of the composition, three adult male rugby union players in mid action, one athletic powerful ball carrier in plain dark navy jersey with a subtle burnt-orange chest stripe, cradling a clearly oval white rugby union ball in two arms running leftward, an opposing player in a plain cream jersey preparing a low tackle, a teammate farther behind. Anatomically correct realistic athletes, muddy shorts, rugby boots, no helmets or pads. The left third should be atmospheric dark negative space, field and mist with no main subject. Camera: low touchline angle, high shutter speed, documentary telephoto lens, authentic detailed sports photography, expressive intensity, visible turf kicked into the air, premium editorial grain. Light: cool steel blue floodlights and a slight warm sidelight on skin. Palette: deep navy, ivory, natural skin tones, muted turf, restrained orange. No text, no sponsors, no real club logos, no watermark, no scoreboard, no borders. This is an illustrative fictional match, not a real news photograph.
