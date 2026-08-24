import type { LucideIcon } from "lucide-react";
import { PenLine, Clapperboard, AudioLines, Captions, Copy, FolderOpen } from "lucide-react";

/** AI Studio nav (workspace steps). */
export const studioNav: { label: string; id: string; icon: LucideIcon }[] = [
  { label: "Composer", id: "composer", icon: PenLine },
  { label: "Storyboard", id: "storyboard", icon: Clapperboard },
  { label: "Voiceover", id: "voiceover", icon: AudioLines },
  { label: "Captions", id: "captions", icon: Captions },
  { label: "Variations", id: "variations", icon: Copy },
  { label: "Library", id: "library", icon: FolderOpen },
];

export const formats = [
  "Instagram Reel",
  "TikTok",
  "YouTube Short",
  "Story",
  "Square social ad",
  "Landscape video",
  "Custom",
];

export const lengths = [6, 10, 15, 30, 45, 60];

export const videoTypes = [
  "AI-generated cinematic",
  "Animated graphics",
  "Brand motion graphics",
  "Photo-to-video",
  "Talking presenter / avatar",
  "Slideshow / storytelling",
  "Existing footage remix",
  "Fundraising advertisement",
  "Event promotion",
];

export const voices = [
  { id: "aria", label: "Aria", style: "Warm, female" },
  { id: "sol", label: "Sol", style: "Energetic, neutral" },
  { id: "lena", label: "Lena", style: "Calm, female" },
  { id: "marco", label: "Marco", style: "Authoritative, male" },
];

export const tones = ["Emotional", "Energetic", "Calm", "Authoritative", "Playful", "Urgent"];

/** Brand context the AI checks before generating (from project assets). */
export const brandContext = [
  "Brand guidelines",
  "Logo & colours",
  "Fonts",
  "Mission & voice",
  "Audience",
  "Approved photography",
  "Campaign folders",
];

export const variationTypes = [
  "Emotional",
  "Urgency",
  "Storytelling",
  "Statistics",
  "Testimonial",
  "Sponsor",
  "6s cutdown",
  "15s Reel",
  "30s Reel",
  "Story",
];

export const approvalSteps = ["Draft", "Review", "Edit", "Approve", "Generate", "Export"];
