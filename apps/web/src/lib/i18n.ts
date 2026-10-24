import "server-only";
import { cookies } from "next/headers";

/** Portal languages: English first, with Kannada and Hindi (CLAUDE.md "Brand"). */
export const LANGS = { en: "English", kn: "ಕನ್ನಡ", hi: "हिन्दी" } as const;
export type Lang = keyof typeof LANGS;

const en = {
  home: "Home", brief: "Brief", menus: "Menus", decor: "Décor", quote: "Quote", payments: "Payments", guests: "Guests & rooms", family: "Family", chat: "Chat",
  ideas: "Ideas", entertainment: "Entertainment", extras: "Add-on services", opens_on: "Opens on", choose: "Choose", decline: "Not for us", chosen: "Chosen", declined: "Declined", final: "Confirmed",
  ideas_help: "Share anything you love here: pictures, links, thoughts. We note every one and pick them up when planning begins.",
  options_help: "Your event manager has picked these for you. Choose the ones you'd like; they'll confirm.",
  namaste: "Namaste", days_to_go: "days to go", today: "Today!", sign_out: "Sign out", your_portal: "Your wedding portal",
  journey: "Your planning journey", journey_help: "Each stage opens on its date. Until then, share your ideas with us and we'll note them.",
  start: "Start", starting: "Starting…", recommended: "Recommended", from_team: "From your Wiwaha team", audit_note: "Every change you make here is recorded with the time, so your team always knows who decided what.",
  locked_stage: "This opens after a payment milestone.", save: "Save", saving: "Saving…", submit: "Submit to your event manager", approve: "Approve", approved: "Approved",
  shortlist: "Shortlist", not_for_us: "Not for us", standard: "Standard", custom: "Custom", pay_now: "Pay now", paid: "Paid, thank you", upcoming: "Upcoming", due: "due",
  send: "Send", chat_help: "Ask anything, or tell us a decision. Your event manager and the Wedding Room assistant reply here.", add_guest: "Add guest", submit_rooming: "Send rooming list",
  nothing_yet: "Nothing here yet.", stage_not_started: "This opens when you press Start on the stage in Home.",
  decor_q_title: "Your décor questionnaire", decor_q_help: "Tell us about your traditions, colours and the touches you love. We'll make a moodboard for every function, showing each space at Wiwaha dressed your way.", decor_q_send: "Send to our décor team", decor_q_sending: "Sending…", decor_preparing: "Thank you! Our team is preparing your moodboards. We'll message you when they're ready.", as_it_is: "The space as it is", could_look: "How it could look", ai_preview: "AI preview: a guide to the mood, not exact pieces", ask_change: "Ask for a change", change_sent: "Thank you, we're on it.", download_pdf: "Download PDF",
};
type Dict = typeof en;
const kn: Dict = {
  home: "ಮುಖಪುಟ", brief: "ವಿವರ", menus: "ಮೆನು", decor: "ಅಲಂಕಾರ", quote: "ಅಂದಾಜು", payments: "ಪಾವತಿಗಳು", guests: "ಅತಿಥಿಗಳು ಮತ್ತು ಕೊಠಡಿಗಳು", family: "ಕುಟುಂಬ", chat: "ಸಂದೇಶ",
  ideas: "ಆಲೋಚನೆಗಳು", entertainment: "ಮನರಂಜನೆ", extras: "ಹೆಚ್ಚುವರಿ ಸೇವೆಗಳು", opens_on: "ಆರಂಭ", choose: "ಆಯ್ಕೆಮಾಡಿ", decline: "ಬೇಡ", chosen: "ಆಯ್ಕೆಮಾಡಲಾಗಿದೆ", declined: "ಬೇಡವೆಂದಿದ್ದೀರಿ", final: "ಖಚಿತ",
  ideas_help: "ನಿಮ್ಮ ಆಲೋಚನೆಗಳನ್ನು ಇಲ್ಲಿ ಹಂಚಿಕೊಳ್ಳಿ; ನಾವು ಪ್ರತಿಯೊಂದನ್ನೂ ಗಮನಿಸಿ, ಯೋಜನೆ ಆರಂಭವಾದಾಗ ಬಳಸುತ್ತೇವೆ.",
  options_help: "ನಿಮ್ಮ ಈವೆಂಟ್ ಮ್ಯಾನೇಜರ್ ಇವುಗಳನ್ನು ನಿಮಗಾಗಿ ಆರಿಸಿದ್ದಾರೆ. ನಿಮಗೆ ಬೇಕಾದವನ್ನು ಆಯ್ಕೆಮಾಡಿ.",
  namaste: "ನಮಸ್ತೆ", days_to_go: "ದಿನಗಳು ಬಾಕಿ", today: "ಇಂದು!", sign_out: "ಸೈನ್ ಔಟ್", your_portal: "ನಿಮ್ಮ ಮದುವೆ ಪೋರ್ಟಲ್",
  journey: "ನಿಮ್ಮ ಯೋಜನೆಯ ಪಯಣ", journey_help: "ಪ್ರತಿ ಹಂತವೂ ಅದರ ದಿನಾಂಕದಂದು ಆರಂಭವಾಗುತ್ತದೆ. ಅಲ್ಲಿಯವರೆಗೆ ನಿಮ್ಮ ಆಲೋಚನೆಗಳನ್ನು ಹಂಚಿಕೊಳ್ಳಿ.",
  start: "ಪ್ರಾರಂಭಿಸಿ", starting: "ಪ್ರಾರಂಭವಾಗುತ್ತಿದೆ…", recommended: "ಸೂಚಿತ", from_team: "ನಿಮ್ಮ ವಿವಾಹ ತಂಡದಿಂದ", audit_note: "ಇಲ್ಲಿ ನೀವು ಮಾಡುವ ಪ್ರತಿಯೊಂದು ಬದಲಾವಣೆಯೂ ಸಮಯದೊಂದಿಗೆ ದಾಖಲಾಗುತ್ತದೆ.",
  locked_stage: "ಪಾವತಿಯ ಹಂತದ ನಂತರ ಇದು ತೆರೆಯುತ್ತದೆ.", save: "ಉಳಿಸಿ", saving: "ಉಳಿಸಲಾಗುತ್ತಿದೆ…", submit: "ನಿಮ್ಮ ಈವೆಂಟ್ ಮ್ಯಾನೇಜರ್‌ಗೆ ಕಳುಹಿಸಿ", approve: "ಅನುಮೋದಿಸಿ", approved: "ಅನುಮೋದಿಸಲಾಗಿದೆ",
  shortlist: "ಆಯ್ಕೆ ಮಾಡಿ", not_for_us: "ನಮಗಲ್ಲ", standard: "ಸಾಮಾನ್ಯ", custom: "ವಿಶೇಷ", pay_now: "ಈಗ ಪಾವತಿಸಿ", paid: "ಪಾವತಿಸಲಾಗಿದೆ, ಧನ್ಯವಾದಗಳು", upcoming: "ಮುಂಬರುವ", due: "ಅಂತಿಮ ದಿನಾಂಕ",
  send: "ಕಳುಹಿಸಿ", chat_help: "ಏನಾದರೂ ಕೇಳಿ ಅಥವಾ ನಿಮ್ಮ ನಿರ್ಧಾರ ತಿಳಿಸಿ. ನಿಮ್ಮ ಈವೆಂಟ್ ಮ್ಯಾನೇಜರ್ ಇಲ್ಲಿ ಉತ್ತರಿಸುತ್ತಾರೆ.", add_guest: "ಅತಿಥಿ ಸೇರಿಸಿ", submit_rooming: "ಕೊಠಡಿ ಪಟ್ಟಿ ಕಳುಹಿಸಿ",
  nothing_yet: "ಇನ್ನೂ ಏನೂ ಇಲ್ಲ.", stage_not_started: "ಮುಖಪುಟದಲ್ಲಿ ಈ ಹಂತವನ್ನು ಪ್ರಾರಂಭಿಸಿದಾಗ ಇದು ತೆರೆಯುತ್ತದೆ.",
  decor_q_title: "ನಿಮ್ಮ ಅಲಂಕಾರ ಪ್ರಶ್ನಾವಳಿ", decor_q_help: "ನಿಮ್ಮ ಸಂಪ್ರದಾಯಗಳು, ಬಣ್ಣಗಳು ಮತ್ತು ನಿಮಗೆ ಇಷ್ಟವಾದ ಅಲಂಕಾರಗಳ ಬಗ್ಗೆ ತಿಳಿಸಿ. ಪ್ರತಿ ಕಾರ್ಯಕ್ರಮಕ್ಕೂ Wiwaha ದ ಪ್ರತಿಯೊಂದು ಸ್ಥಳವನ್ನು ನಿಮ್ಮ ಇಷ್ಟದಂತೆ ತೋರಿಸುವ ಮೂಡ್‌ಬೋರ್ಡ್ ಸಿದ್ಧಪಡಿಸುತ್ತೇವೆ.", decor_q_send: "ನಮ್ಮ ಅಲಂಕಾರ ತಂಡಕ್ಕೆ ಕಳುಹಿಸಿ", decor_q_sending: "ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…", decor_preparing: "ಧನ್ಯವಾದಗಳು! ನಮ್ಮ ತಂಡ ನಿಮ್ಮ ಮೂಡ್‌ಬೋರ್ಡ್‌ಗಳನ್ನು ಸಿದ್ಧಪಡಿಸುತ್ತಿದೆ. ಸಿದ್ಧವಾದಾಗ ನಿಮಗೆ ತಿಳಿಸುತ್ತೇವೆ.", as_it_is: "ಈಗಿರುವ ಸ್ಥಳ", could_look: "ಹೀಗೆ ಕಾಣಬಹುದು", ai_preview: "AI ಮುನ್ನೋಟ: ಮನೋಭಾವದ ಮಾರ್ಗದರ್ಶಿ, ನಿಖರ ವಸ್ತುಗಳಲ್ಲ", ask_change: "ಬದಲಾವಣೆ ಕೇಳಿ", change_sent: "ಧನ್ಯವಾದಗಳು, ನಾವು ನೋಡಿಕೊಳ್ಳುತ್ತೇವೆ.", download_pdf: "PDF ಡೌನ್‌ಲೋಡ್",
};
const hi: Dict = {
  home: "होम", brief: "ब्रीफ़", menus: "मेन्यू", decor: "सजावट", quote: "कोटेशन", payments: "भुगतान", guests: "मेहमान और कमरे", family: "परिवार", chat: "चैट",
  ideas: "आइडिया", entertainment: "मनोरंजन", extras: "अतिरिक्त सेवाएँ", opens_on: "शुरू होगा", choose: "चुनें", decline: "नहीं चाहिए", chosen: "चुना गया", declined: "मना किया", final: "पक्का",
  ideas_help: "अपने आइडिया यहाँ साझा करें; हम हर एक को नोट करते हैं और योजना शुरू होने पर उन पर काम करते हैं।",
  options_help: "आपके इवेंट मैनेजर ने ये आपके लिए चुने हैं। जो पसंद हों उन्हें चुनें।",
  namaste: "नमस्ते", days_to_go: "दिन बाकी", today: "आज!", sign_out: "साइन आउट", your_portal: "आपका शादी पोर्टल",
  journey: "आपकी योजना की यात्रा", journey_help: "हर चरण अपनी तारीख़ पर खुलता है। तब तक अपने आइडिया हमसे साझा करें।",
  start: "शुरू करें", starting: "शुरू हो रहा है…", recommended: "सुझाव", from_team: "आपकी विवाह टीम की ओर से", audit_note: "यहाँ किया गया हर बदलाव समय के साथ दर्ज होता है, ताकि टीम को पता रहे कि किसने क्या तय किया।",
  locked_stage: "यह एक भुगतान चरण के बाद खुलेगा।", save: "सहेजें", saving: "सहेजा जा रहा है…", submit: "अपने इवेंट मैनेजर को भेजें", approve: "स्वीकृत करें", approved: "स्वीकृत",
  shortlist: "पसंद करें", not_for_us: "हमारे लिए नहीं", standard: "मानक", custom: "कस्टम", pay_now: "अभी भुगतान करें", paid: "भुगतान हो गया, धन्यवाद", upcoming: "आगामी", due: "देय",
  send: "भेजें", chat_help: "कुछ भी पूछें या अपना फ़ैसला बताएँ। आपके इवेंट मैनेजर यहीं जवाब देंगे।", add_guest: "मेहमान जोड़ें", submit_rooming: "कमरों की सूची भेजें",
  nothing_yet: "अभी यहाँ कुछ नहीं है।", stage_not_started: "होम पर यह चरण शुरू करने के बाद यह खुलेगा।",
  decor_q_title: "आपकी सजावट प्रश्नावली", decor_q_help: "अपनी परंपराओं, रंगों और पसंदीदा सजावट के बारे में बताइए। हम हर समारोह के लिए मूडबोर्ड बनाएँगे, जिसमें Wiwaha की हर जगह आपकी पसंद से सजी दिखेगी।", decor_q_send: "हमारी सजावट टीम को भेजें", decor_q_sending: "भेजा जा रहा है…", decor_preparing: "धन्यवाद! हमारी टीम आपके मूडबोर्ड तैयार कर रही है। तैयार होते ही हम आपको बताएँगे।", as_it_is: "जगह अभी जैसी है", could_look: "ऐसी दिख सकती है", ai_preview: "AI पूर्वावलोकन: माहौल की झलक, सटीक सामान नहीं", ask_change: "बदलाव बताएँ", change_sent: "धन्यवाद, हम इस पर काम कर रहे हैं।", download_pdf: "PDF डाउनलोड करें",
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
