# OWP game art — full generation brief

Generate each image below, **name it exactly** as the heading, and drop them all
into `public/art/`. Every prompt already bakes in the shared style so the set
comes out cohesive. Transparent PNGs where noted — that matters (no background
box). These are the *in-game* elements; the existing game card/banner images
stay as they are.

**Shared style (already inside each prompt):** premium editorial crypto-casino
art in a frog-and-pond world — deep teal-green + antique-gold palette, dark moody
lighting, soft rim light, elegant and a little mysterious, high detail, **not
cartoonish, not neon**.

---

## Frog Flip — the coin

### `owp_coin_frog.png`  (512×512, transparent outside the circle)
```
A circular embossed metal coin face viewed straight on. A stylized frog emblem struck in relief into brushed green-gold metal, with a milled/reeded rim, soft rim lighting and subtle depth. Premium editorial crypto-casino style, deep teal-green and antique-gold palette, dark moody lighting, elegant and a little mysterious, high detail, not cartoonish, not neon. The coin fills the frame as a perfect circle, centered; fully transparent everywhere outside the circle. No text, no numbers, no watermark. 512x512 PNG with transparency.
```

### `owp_coin_fly.png`  (512×512, transparent outside the circle)
```
A circular embossed metal coin face viewed straight on, a companion to a frog coin. A stylized winged fly emblem struck in relief into brushed metal with a faint cool violet-green sheen, milled/reeded rim, soft rim lighting and subtle depth. Premium editorial crypto-casino style, antique-gold and teal palette, dark moody lighting, elegant, high detail, not cartoonish, not neon. Fills the frame as a perfect circle, centered; fully transparent outside the circle. No text, no numbers, no watermark. 512x512 PNG with transparency.
```

---

## Pond Dice — the roll token

### `owp_dice_orb.png`  (256×256, transparent)
```
A single glossy spherical marble/orb: polished dark-green glass with a slow golden swirl suspended inside and one bright specular highlight, like a mystical pond gem. Premium editorial crypto-casino style, deep teal-green and antique-gold palette, dark moody lighting, elegant and mysterious, high detail, not cartoonish, not neon. Centered, floating, fully transparent background, no cast shadow. No text. 256x256 PNG with transparency.
```

---

## Blackjack — the cards

### `owp_card_back.png`  (320×448, full-bleed, ~5:7 card)
```
The back of a premium playing card, full-bleed rectangle in a 5:7 ratio. An ornate symmetrical pattern in antique gold over deep teal-green, with a small central frog-crest medallion and an elegant filigree border framing the edges. Premium editorial crypto-casino style, dark and luxurious, high detail, not cartoonish, not neon. Fills the whole card to the edges, slightly rounded corners. No text, no numbers. 320x448 PNG.
```

### `owp_card_face.png`  (320×448, full-bleed, ~5:7 card)
```
A BLANK premium playing-card face, full-bleed rectangle in a 5:7 ratio. Warm cream/ivory surface with a very faint frog watermark in the middle and delicate thin gold filigree only in the four corners — the center and the corners must stay mostly clear and empty so a rank letter and a suit symbol can be printed on top later. Elegant, luxurious, high detail, not cartoonish, not neon. Slightly rounded corners. IMPORTANT: no letters, no numbers, no suit symbols anywhere. 320x448 PNG.
```

---

## Hopper (cross-the-pond) — sprites, all top-down

### `owp_hopper_frog.png`  (160×160, transparent)
```
A sleek tree-frog game sprite seen from a top-down 3/4 angle, as if hopping upward away from the viewer. Crisp readable silhouette, glossy green skin with gold accents, big alert eyes. Premium editorial style, deep teal-green and antique-gold palette, soft rim light, high detail, not cartoonish, not neon. Centered, fully transparent background, no shadow. 160x160 PNG with transparency.
```

### `owp_hopper_hazard.png`  (200×120, transparent)
```
A menacing pond-predator hazard for a top-down crossing game: a dark koi/pike fish with faint bioluminescent edges, oriented horizontally, crisp readable silhouette. Premium editorial style, deep teal-green and antique-gold palette, moody, high detail, not cartoonish, not neon. Fully transparent background, no shadow. 200x120 PNG with transparency.
```

### `owp_hopper_log.png`  (220×90, transparent)
```
A floating safe platform for a top-down crossing game: a mossy log fused with a lily pad, oriented horizontally, glossy wet surface with subtle gold veining. Premium editorial style, deep teal-green and antique-gold palette, high detail, not cartoonish, not neon. Fully transparent background, no shadow. 220x90 PNG with transparency.
```

---

## Frogris (falling blocks) — one tile, I tint it per piece

### `owp_frogris_tile.png`  (128×128, transparent corners)
```
A single glossy rounded game tile / gem block viewed straight on, near-white to pale-silver so it can be tinted any color in code, with a soft glassy top highlight and a subtle beveled edge. Premium editorial style, clean and luxurious, high detail, not cartoonish, not neon. Fills the frame as a rounded square with transparent corners. No text. 128x128 PNG with transparency.
```

---

## Worm (pond serpent) — sprites, all top-down

### `owp_worm_head.png`  (120×120, transparent)
```
The head of a frog-serpent for a top-down snake game: glossy green with large golden eyes and a determined expression, crisp silhouette facing upward. Premium editorial style, deep teal-green and antique-gold palette, soft rim light, high detail, not cartoonish, not neon. Centered, fully transparent background, no shadow. 120x120 PNG with transparency.
```

### `owp_worm_segment.png`  (100×100, transparent)
```
A single round body segment / glossy bead for a frog-serpent, top-down: deep-green with a golden sheen and one soft highlight, crisp circular silhouette. Premium editorial style, high detail, not cartoonish, not neon. Centered, fully transparent background, no shadow. 100x100 PNG with transparency.
```

### `owp_worm_fly.png`  (80×80, transparent)
```
A small glowing fly as game food, top-down: amber-gold body with faint luminous translucent wings, crisp silhouette. Premium editorial style, high detail, not cartoonish, not neon. Centered, fully transparent background, no shadow. 80x80 PNG with transparency.
```

---

## Optional — a shared stage backdrop (nice-to-have)

### `owp_pond_bg.jpg`  (1600×1000)
```
An atmospheric backdrop for a game table: a dark moonlit pond fading into a misty green-violet gloom, deep depth, faint bioluminescent motes, an empty uncluttered center (UI sits on top). Premium editorial style, deep teal-green and antique-gold palette, cinematic and moody, no characters, no text. 1600x1000 JPG.
```

---

**When they're ready:** put all the files in `public/art/` (or hand me the folder and I'll place them). Tell me they're in, and I'll wire each into its game and do the per-game visual rework around them (canvas sprites for the arcade trio, animated dealt cards for blackjack, the coin + roll token for flip/dice).
