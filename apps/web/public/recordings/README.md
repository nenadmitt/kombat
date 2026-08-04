# Gameplay recordings

Looping gameplay clips that play inside the phone frames on the landing page.
Drop encoded `.mp4` files in this folder, then reference them:

- **Games carousel**: set `videos: ["/recordings/<game>-1.mp4", "/recordings/<game>-2.mp4"]`
  on the game's entry in `src/components/GamesCarousel.tsx`. Either slot may be
  `undefined` to keep the screenshot in that frame.
- **Hero phones**: pass `video="/recordings/<file>.mp4"` to any `PhoneFrame`
  in `src/app/page.tsx`. The `src` screenshot stays as the poster.

Videos autoplay muted in a loop, pause when scrolled offscreen, and stay on the
poster frame for users with reduced motion enabled.

Screenshots and clips are served with a one-year immutable cache, so replacing
one in place needs a new filename - or, in dev, `rm -rf apps/web/.next/dev/cache/images`
and a restart, since the optimizer keys its cache on the URL alone.

## Recording

From the iOS simulator (mobile app running a match):

```sh
xcrun simctl io booted recordVideo --codec h264 --mask ignored raw.mov
# Ctrl-C to stop. 15-30s of mid-match play loops best.
```

A physical device screen recording works too (AirDrop the .mov over).

## Encoding

Keep the full device frame - status bar included, matching the screenshots.
Just cap the size and strip audio:

```sh
ffmpeg -i raw.mov -vf "scale=486:-2,fps=30" \
  -an -c:v libx264 -crf 26 -pix_fmt yuv420p -movflags +faststart \
  <game>-1.mp4
```

Target ≤2-3 MB per clip - the largest frame renders at ~262 CSS px wide, so
486px of video width is already 1.85x retina.
