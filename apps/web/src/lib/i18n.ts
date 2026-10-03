import "server-only";
import { cookies } from "next/headers";

/** Portal languages: English first, with Kannada and Hindi (CLAUDE.md "Brand"). */
export const LANGS = { en: "English", kn: "ಕನ್ನಡ", hi: "हिन्दी" } as const;
export type Lang = keyof typeof LANGS;

const en = {
  home: "Home", brief: "Brief", menus: "Menus", decor: "Décor", quote: "Quote", payments: "Payments", guests: "Guests & rooms", family: "Family", chat: "Chat",
  namaste: "Namaste", days_to_go: "days to go", today: "Today!", sign_out: "Sign out", your_portal: "Your wedding portal",
  journey: "Your planning journey", journey_help: "Each stage has a recommended start date, but you set the pace. Press Start whenever you're ready.",
  start: "Start", starting: "Starting…", recommended: "Recommended", from_team: "From your Wiwaha team", audit_note: "Every change you make here is recorded with the time, so your team always knows who decided what.",
  locked_stage: "This opens after a payment milestone.", save: "Save", saving: "Saving…", submit: "Submit to your event manager", approve: "Approve", approved: "Approved",
  shortlist: "Shortlist", not_for_us: "Not for us", standard: "Standard", custom: "Custom", pay_now: "Pay now", paid: "Paid, thank you", upcoming: "Upcoming", due: "due",
  send: "Send", chat_help: "Ask anything, or tell us a decision. Your event manager and the Wedding Room assistant reply here.", add_guest: "Add guest", submit_rooming: "Send rooming list",
  nothing_yet: "Nothing here yet.", stage_not_started: "This opens when you press Start on the stage in Home.",
};
type Dict = typeof en;
const kn: Dict = {
  home: "ಮುಖಪುಟ", brief: "ವಿವರ", menus: "ಮೆನು", decor: "ಅಲಂಕಾರ", quote: "ಅಂದಾಜು", payments: "ಪಾವತಿಗಳು", guests: "ಅತಿಥಿಗಳು ಮತ್ತು ಕೊಠಡಿಗಳು", family: "ಕುಟುಂಬ", chat: "ಸಂದೇಶ",
  namaste: "ನಮಸ್ತೆ", days_to_go: "ದಿನಗಳು ಬಾಕಿ", today: "ಇಂದು!", sign_out: "ಸೈನ್ ಔಟ್", your_portal: "ನಿಮ್ಮ ಮದುವೆ ಪೋರ್ಟಲ್",
  journey: "ನಿಮ್ಮ ಯೋಜನೆಯ ಪಯಣ", journey_help: "ಪ್ರತಿ ಹಂತಕ್ಕೂ ಸೂಚಿತ ಆರಂಭ ದಿನಾಂಕವಿದೆ, ಆದರೆ ವೇಗವನ್ನು ನೀವೇ ನಿರ್ಧರಿಸಿ. ಸಿದ್ಧವಾದಾಗ ಪ್ರಾರಂಭಿಸಿ ಒತ್ತಿರಿ.",
  start: "ಪ್ರಾರಂಭಿಸಿ", starting: "ಪ್ರಾರಂಭವಾಗುತ್ತಿದೆ…", recommended: "ಸೂಚಿತ", from_team: "ನಿಮ್ಮ ವಿವಾಹ ತಂಡದಿಂದ", audit_note: "ಇಲ್ಲಿ ನೀವು ಮಾಡುವ ಪ್ರತಿಯೊಂದು ಬದಲಾವಣೆಯೂ ಸಮಯದೊಂದಿಗೆ ದಾಖಲಾಗುತ್ತದೆ.",
  locked_stage: "ಪಾವತಿಯ ಹಂತದ ನಂತರ ಇದು ತೆರೆಯುತ್ತದೆ.", save: "ಉಳಿಸಿ", saving: "ಉಳಿಸಲಾಗುತ್ತಿದೆ…", submit: "ನಿಮ್ಮ ಈವೆಂಟ್ ಮ್ಯಾನೇಜರ್‌ಗೆ ಕಳುಹಿಸಿ", approve: "ಅನುಮೋದಿಸಿ", approved: "ಅನುಮೋದಿಸಲಾಗಿದೆ",
  shortlist: "ಆಯ್ಕೆ ಮಾಡಿ", not_for_us: "ನಮಗಲ್ಲ", standard: "ಸಾಮಾನ್ಯ", custom: "ವಿಶೇಷ", pay_now: "ಈಗ ಪಾವತಿಸಿ", paid: "ಪಾವತಿಸಲಾಗಿದೆ, ಧನ್ಯವಾದಗಳು", upcoming: "ಮುಂಬರುವ", due: "ಅಂತಿಮ ದಿನಾಂಕ",
  send: "ಕಳುಹಿಸಿ", chat_help: "ಏನಾದರೂ ಕೇಳಿ ಅಥವಾ ನಿಮ್ಮ ನಿರ್ಧಾರ ತಿಳಿಸಿ. ನಿಮ್ಮ ಈವೆಂಟ್ ಮ್ಯಾನೇಜರ್ ಇಲ್ಲಿ ಉತ್ತರಿಸುತ್ತಾರೆ.", add_guest: "ಅತಿಥಿ ಸೇರಿಸಿ", submit_rooming: "ಕೊಠಡಿ ಪಟ್ಟಿ ಕಳುಹಿಸಿ",
  nothing_yet: "ಇನ್ನೂ ಏನೂ ಇಲ್ಲ.", stage_not_started: "ಮುಖಪುಟದಲ್ಲಿ ಈ ಹಂತವನ್ನು ಪ್ರಾರಂಭಿಸಿದಾಗ ಇದು ತೆರೆಯುತ್ತದೆ.",
};
const hi: Dict = {
  home: "होम", brief: "ब्रीफ़", menus: "मेन्यू", decor: "सजावट", quote: "कोटेशन", payments: "भुगतान", guests: "मेहमान और कमरे", family: "परिवार", chat: "चैट",
  namaste: "नमस्ते", days_to_go: "दिन बाकी", today: "आज!", sign_out: "साइन आउट", your_portal: "आपका शादी पोर्टल",
  journey: "आपकी योजना की यात्रा", journey_help: "हर चरण की एक सुझाई गई शुरुआती तारीख है, पर रफ़्तार आप तय करें। जब तैयार हों, शुरू करें दबाएँ।",
  start: "शुरू करें", starting: "शुरू हो रहा है…", recommended: "सुझाव", from_team: "आपकी विवाह टीम की ओर से", audit_note: "यहाँ किया गया हर बदलाव समय के साथ दर्ज होता है, ताकि टीम को पता रहे कि किसने क्या तय किया।",
  locked_stage: "यह एक भुगतान चरण के बाद खुलेगा।", save: "सहेजें", saving: "सहेजा जा रहा है…", submit: "अपने इवेंट मैनेजर को भेजें", approve: "स्वीकृत करें", approved: "स्वीकृत",
  shortlist: "पसंद करें", not_for_us: "हमारे लिए नहीं", standard: "मानक", custom: "कस्टम", pay_now: "अभी भुगतान करें", paid: "भुगतान हो गया, धन्यवाद", upcoming: "आगामी", due: "देय",
  send: "भेजें", chat_help: "कुछ भी पूछें या अपना फ़ैसला बताएँ। आपके इवेंट मैनेजर यहीं जवाब देंगे।", add_guest: "मेहमान जोड़ें", submit_rooming: "कमरों की सूची भेजें",
  nothing_yet: "अभी यहाँ कुछ नहीं है।", stage_not_started: "होम पर यह चरण शुरू करने के बाद यह खुलेगा।",
};
const DICTS: Record<Lang, Dict> = { en, kn, hi };

export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get("lang")?.value;
  return v === "kn" || v === "hi" ? v : "en";
}

export async function getDict(): Promise<Dict & { lang: Lang }> {
  const lang = await getLang();
  return { ...DICTS[lang], lang };
}
export type PortalDict = Awaited<ReturnType<typeof getDict>>;
