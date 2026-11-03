# Glasshouse Cinema

You are an expert Next.js developer and UI/UX designer specializing in premium media applications. Build a complete, production-quality movies app with the following features and specifications.

The app must have a glassmorphism UI design with frosted glass effects, blurred backgrounds, and subtle gradients. Use large movie cards that are visually prominent with hover animations, smooth transitions, and a premium feel. Implement a proper video player that supports common video formats (MP4, WebM, AVI, MOV) with controls for play/pause, volume, seek, fullscreen, and playback speed. The app should dynamically read videos from the system's videos folder (e.g., ~/Videos or /Users/[username]/Videos on macOS, or the standard Videos directory on other OS) using a Node.js backend API endpoint, extract the filename (without extension) as the movie title, and display those titles on the page with thumbnail previews generated server-side. Include a smart search feature that filters movie cards in real-time by title with debounced input, partial matching, and instant results.

Structure the app using Next.js (App Router recommended) with pages/index.tsx as the main page, a /api/videos route that reads the directory and returns metadata (name, path, thumbnail as base64 or URL), and a VideoPlayer component. Use TypeScript, Tailwind CSS for styling with custom glassmorphism classes, and Framer Motion for card animations. The video player should be a custom component wrapping HTML5 video with full controls. All paths and folder references should be configurable via environment variables (VIDEOS_DIRECTORY). Include proper error handling for missing directories or unreadable files, and ensure the app runs on both development and production builds. Provide the complete code for each file with clear comments explaining the logic.

C:\Users\Saurabh\Videos\UXU (here all movies and videos)

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/fde34578-8c88-408b-a329-d20f858b55cc).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
