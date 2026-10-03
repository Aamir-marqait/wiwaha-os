/**
 * What the concierge says, per language. Only *phrasing* lives here: every
 * fact (rooms, distance, the price band, slots) is filled in from the policy
 * book and live data at runtime. Kannada, Hindi, Tamil and Telugu lines are
 * first drafts for a native speaker to review (docs/open-questions.md).
 */
export type VoiceLang = "en" | "kn" | "hi" | "ta" | "te";

export interface Phrasebook {
  greeting: (recorded: boolean) => string;
  askCity: string;
  priceLocal: string;
  priceBand: (band: string) => string;
  priceNoBand: string;
  discount: string;
  dateFree: (date: string) => string;
  dateTaken: (date: string, alternatives: string) => string;
  dateTakenNoAlternatives: (date: string) => string;
  offerSlot: (slot: string) => string;
  noSlots: string;
  askName: string;
  booked: (slot: string) => string;
  transfer: string;
  callback: (minutes: number) => string;
  unknown: string;
  rooms: (n: number, free: boolean) => string;
  airport: (km: number) => string;
  catering: (list: string, outside: boolean) => string;
  capacity: (n: number) => string;
  anythingElse: string;
  goodbye: string;
  didNotCatch: string;
  followUpOpen: (name: string) => string;
  followUpThanks: string;
}

const en: Phrasebook = {
  greeting: (rec) => `Namaste, thank you for calling Wiwaha by Praman.${rec ? " This call is recorded so we can serve you better." : ""} How may I help you?`,
  askCity: "May I know where the family is based?",
  priceLocal: "Our pricing depends on your dates, guest count and plans, so we share it in person when you visit. Would you like me to book a time for you to see the estate?",
  priceBand: (band) => `Celebrations here start from ${band}. I'll send our brochure and a video tour on WhatsApp, and we can set up a video call with the team.`,
  priceNoBand: "I'll have the team send you our brochure and a video tour on WhatsApp, and someone will get back to you personally about pricing.",
  discount: "I'm not able to promise a discount, but the team will be happy to discuss everything with you when you visit.",
  dateFree: (d) => `${d} is currently open.`,
  dateTaken: (d, alt) => `I'm sorry, ${d} is already booked. Nearby dates that are open: ${alt}.`,
  dateTakenNoAlternatives: (d) => `I'm sorry, ${d} is already booked. The team will look for the closest dates and call you back.`,
  offerSlot: (s) => `I can book a visit for ${s}. Shall I go ahead?`,
  noSlots: "I don't have an open visiting slot in the next few days, so the team will call you to arrange one.",
  askName: "May I have your name for the booking?",
  booked: (s) => `Done. Your visit is booked for ${s}. You'll receive a WhatsApp confirmation with the location.`,
  transfer: "Of course, let me connect you to our team right away.",
  callback: (m) => `Our team is busy at the moment. Someone will call you back within ${m} minutes.`,
  unknown: "Let me check that with the team and get back to you, rather than guess.",
  rooms: (n, free) => `The estate has ${n} guest rooms${free ? ", complimentary with your booking" : ""}.`,
  airport: (km) => `We're just ${km} km from Bengaluru airport.`,
  catering: (list, outside) => `Catering is in-house, with ${list}${outside ? ", or you're welcome to bring your own caterer" : ""}.`,
  capacity: (n) => `Our largest space comfortably seats ${n} guests.`,
  anythingElse: "Is there anything else I can help you with?",
  goodbye: "Thank you for calling Wiwaha. Have a lovely day.",
  didNotCatch: "Sorry, I didn't catch that. Could you say it again?",
  followUpOpen: (n) => `Namaste${n ? ` ${n}` : ""}, this is Wiwaha by Praman. Thank you for visiting the estate. Do you have any questions we can help with?`,
  followUpThanks: "Thank you. I've noted that for the team.",
};

const kn: Phrasebook = {
  greeting: (rec) => `ನಮಸ್ಕಾರ, ವಿವಾಹ ಬೈ ಪ್ರಮಾಣ್‌ಗೆ ಕರೆ ಮಾಡಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದಗಳು.${rec ? " ಉತ್ತಮ ಸೇವೆಗಾಗಿ ಈ ಕರೆಯನ್ನು ರೆಕಾರ್ಡ್ ಮಾಡಲಾಗುತ್ತಿದೆ." : ""} ನಾನು ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?`,
  askCity: "ನಿಮ್ಮ ಕುಟುಂಬ ಯಾವ ಊರಿನವರು ಎಂದು ತಿಳಿಸಬಹುದೇ?",
  priceLocal: "ನಮ್ಮ ದರಗಳು ನಿಮ್ಮ ದಿನಾಂಕ, ಅತಿಥಿಗಳ ಸಂಖ್ಯೆ ಮತ್ತು ಯೋಜನೆಗಳನ್ನು ಅವಲಂಬಿಸಿವೆ, ಆದ್ದರಿಂದ ನೀವು ಭೇಟಿ ನೀಡಿದಾಗ ನೇರವಾಗಿ ತಿಳಿಸುತ್ತೇವೆ. ಎಸ್ಟೇಟ್ ನೋಡಲು ಒಂದು ಸಮಯ ಬುಕ್ ಮಾಡಲೇ?",
  priceBand: (band) => `ಇಲ್ಲಿ ಸಮಾರಂಭಗಳು ${band} ರಿಂದ ಪ್ರಾರಂಭವಾಗುತ್ತವೆ. ನಮ್ಮ ಬ್ರೋಶರ್ ಮತ್ತು ವಿಡಿಯೋ ಟೂರ್ ಅನ್ನು ವಾಟ್ಸಾಪ್‌ನಲ್ಲಿ ಕಳುಹಿಸುತ್ತೇನೆ, ತಂಡದೊಂದಿಗೆ ವಿಡಿಯೋ ಕರೆಯನ್ನೂ ಏರ್ಪಡಿಸಬಹುದು.`,
  priceNoBand: "ನಮ್ಮ ತಂಡ ಬ್ರೋಶರ್ ಮತ್ತು ವಿಡಿಯೋ ಟೂರ್ ಅನ್ನು ವಾಟ್ಸಾಪ್‌ನಲ್ಲಿ ಕಳುಹಿಸುತ್ತದೆ, ದರಗಳ ಬಗ್ಗೆ ಯಾರಾದರೂ ನಿಮ್ಮನ್ನು ನೇರವಾಗಿ ಸಂಪರ್ಕಿಸುತ್ತಾರೆ.",
  discount: "ರಿಯಾಯಿತಿಯ ಬಗ್ಗೆ ನಾನು ಭರವಸೆ ನೀಡಲು ಸಾಧ್ಯವಿಲ್ಲ, ಆದರೆ ನೀವು ಭೇಟಿ ನೀಡಿದಾಗ ತಂಡ ಎಲ್ಲವನ್ನೂ ಸಂತೋಷದಿಂದ ಚರ್ಚಿಸುತ್ತದೆ.",
  dateFree: (d) => `${d} ಸದ್ಯಕ್ಕೆ ಲಭ್ಯವಿದೆ.`,
  dateTaken: (d, alt) => `ಕ್ಷಮಿಸಿ, ${d} ಈಗಾಗಲೇ ಬುಕ್ ಆಗಿದೆ. ಹತ್ತಿರದ ಲಭ್ಯವಿರುವ ದಿನಾಂಕಗಳು: ${alt}.`,
  dateTakenNoAlternatives: (d) => `ಕ್ಷಮಿಸಿ, ${d} ಈಗಾಗಲೇ ಬುಕ್ ಆಗಿದೆ. ತಂಡ ಹತ್ತಿರದ ದಿನಾಂಕಗಳನ್ನು ಹುಡುಕಿ ನಿಮಗೆ ಮರಳಿ ಕರೆ ಮಾಡುತ್ತದೆ.`,
  offerSlot: (s) => `${s} ಕ್ಕೆ ಭೇಟಿಯನ್ನು ಬುಕ್ ಮಾಡಬಹುದು. ಮುಂದುವರಿಯಲೇ?`,
  noSlots: "ಮುಂದಿನ ಕೆಲವು ದಿನಗಳಲ್ಲಿ ಭೇಟಿಗೆ ಸಮಯ ಖಾಲಿ ಇಲ್ಲ, ತಂಡ ನಿಮಗೆ ಕರೆ ಮಾಡಿ ಏರ್ಪಡಿಸುತ್ತದೆ.",
  askName: "ಬುಕಿಂಗ್‌ಗಾಗಿ ನಿಮ್ಮ ಹೆಸರು ತಿಳಿಸಬಹುದೇ?",
  booked: (s) => `ಆಯಿತು. ನಿಮ್ಮ ಭೇಟಿ ${s} ಕ್ಕೆ ಬುಕ್ ಆಗಿದೆ. ಸ್ಥಳದ ವಿವರದೊಂದಿಗೆ ವಾಟ್ಸಾಪ್ ದೃಢೀಕರಣ ಬರುತ್ತದೆ.`,
  transfer: "ಖಂಡಿತ, ಈಗಲೇ ನಮ್ಮ ತಂಡಕ್ಕೆ ಕರೆಯನ್ನು ಸಂಪರ್ಕಿಸುತ್ತೇನೆ.",
  callback: (m) => `ನಮ್ಮ ತಂಡ ಈಗ ಬ್ಯುಸಿಯಾಗಿದೆ. ${m} ನಿಮಿಷಗಳೊಳಗೆ ಯಾರಾದರೂ ನಿಮಗೆ ಮರಳಿ ಕರೆ ಮಾಡುತ್ತಾರೆ.`,
  unknown: "ಊಹಿಸುವ ಬದಲು ತಂಡದೊಂದಿಗೆ ಪರಿಶೀಲಿಸಿ ನಿಮಗೆ ತಿಳಿಸುತ್ತೇನೆ.",
  rooms: (n, free) => `ಎಸ್ಟೇಟ್‌ನಲ್ಲಿ ${n} ಅತಿಥಿ ಕೊಠಡಿಗಳಿವೆ${free ? ", ನಿಮ್ಮ ಬುಕಿಂಗ್ ಜೊತೆ ಉಚಿತ" : ""}.`,
  airport: (km) => `ನಾವು ಬೆಂಗಳೂರು ವಿಮಾನ ನಿಲ್ದಾಣದಿಂದ ಕೇವಲ ${km} ಕಿ.ಮೀ ದೂರದಲ್ಲಿದ್ದೇವೆ.`,
  catering: (list, outside) => `ಅಡುಗೆ ವ್ಯವಸ್ಥೆ ನಮ್ಮಲ್ಲೇ ಇದೆ: ${list}${outside ? ", ಅಥವಾ ನಿಮ್ಮದೇ ಕೇಟರರ್ ಕರೆತರಬಹುದು" : ""}.`,
  capacity: (n) => `ನಮ್ಮ ದೊಡ್ಡ ಸ್ಥಳದಲ್ಲಿ ${n} ಅತಿಥಿಗಳು ಆರಾಮವಾಗಿ ಕುಳಿತುಕೊಳ್ಳಬಹುದು.`,
  anythingElse: "ಇನ್ನೇನಾದರೂ ಸಹಾಯ ಬೇಕೇ?",
  goodbye: "ವಿವಾಹಕ್ಕೆ ಕರೆ ಮಾಡಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದಗಳು. ಶುಭ ದಿನ.",
  didNotCatch: "ಕ್ಷಮಿಸಿ, ಸರಿಯಾಗಿ ಕೇಳಿಸಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೊಮ್ಮೆ ಹೇಳುತ್ತೀರಾ?",
  followUpOpen: (n) => `ನಮಸ್ಕಾರ${n ? ` ${n}` : ""}, ನಾನು ವಿವಾಹ ಬೈ ಪ್ರಮಾಣ್‌ನಿಂದ ಕರೆ ಮಾಡುತ್ತಿದ್ದೇನೆ. ಎಸ್ಟೇಟ್‌ಗೆ ಭೇಟಿ ನೀಡಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದಗಳು. ನಿಮಗೆ ಏನಾದರೂ ಪ್ರಶ್ನೆಗಳಿವೆಯೇ?`,
  followUpThanks: "ಧನ್ಯವಾದಗಳು. ತಂಡಕ್ಕಾಗಿ ಇದನ್ನು ಗುರುತು ಮಾಡಿಕೊಂಡಿದ್ದೇನೆ.",
};

const hi: Phrasebook = {
  greeting: (rec) => `नमस्ते, विवाह बाय प्रमाण को कॉल करने के लिए धन्यवाद।${rec ? " बेहतर सेवा के लिए यह कॉल रिकॉर्ड की जा रही है।" : ""} मैं आपकी कैसे मदद कर सकती हूँ?`,
  askCity: "क्या मैं जान सकती हूँ कि परिवार किस शहर से है?",
  priceLocal: "हमारी कीमतें आपकी तारीख़, मेहमानों की संख्या और योजनाओं पर निर्भर करती हैं, इसलिए हम आपके आने पर ही बताते हैं। क्या मैं एस्टेट देखने के लिए आपका समय बुक कर दूँ?",
  priceBand: (band) => `यहाँ समारोह ${band} से शुरू होते हैं। मैं हमारा ब्रोशर और वीडियो टूर व्हाट्सऐप पर भेज दूँगी, और टीम के साथ वीडियो कॉल भी रख सकते हैं।`,
  priceNoBand: "टीम आपको हमारा ब्रोशर और वीडियो टूर व्हाट्सऐप पर भेजेगी, और कीमत के बारे में कोई आपसे सीधे संपर्क करेगा।",
  discount: "मैं छूट का वादा नहीं कर सकती, लेकिन आपके आने पर टीम ख़ुशी से सब कुछ आपसे चर्चा करेगी।",
  dateFree: (d) => `${d} अभी उपलब्ध है।`,
  dateTaken: (d, alt) => `माफ़ कीजिए, ${d} पहले से बुक है। पास की उपलब्ध तारीख़ें: ${alt}।`,
  dateTakenNoAlternatives: (d) => `माफ़ कीजिए, ${d} पहले से बुक है। टीम पास की तारीख़ें देखकर आपको कॉल करेगी।`,
  offerSlot: (s) => `मैं ${s} के लिए विज़िट बुक कर सकती हूँ। क्या आगे बढ़ूँ?`,
  noSlots: "अगले कुछ दिनों में विज़िट का कोई समय ख़ाली नहीं है, टीम आपको कॉल करके तय करेगी।",
  askName: "बुकिंग के लिए आपका नाम बताएँगे?",
  booked: (s) => `हो गया। आपकी विज़िट ${s} के लिए बुक है। लोकेशन के साथ व्हाट्सऐप पर पुष्टि मिल जाएगी।`,
  transfer: "ज़रूर, मैं अभी आपको हमारी टीम से जोड़ती हूँ।",
  callback: (m) => `हमारी टीम अभी व्यस्त है। ${m} मिनट के अंदर कोई आपको वापस कॉल करेगा।`,
  unknown: "अंदाज़ा लगाने के बजाय मैं टीम से पूछकर आपको बताती हूँ।",
  rooms: (n, free) => `एस्टेट में ${n} गेस्ट रूम हैं${free ? ", जो आपकी बुकिंग के साथ मुफ़्त हैं" : ""}।`,
  airport: (km) => `हम बेंगलुरु एयरपोर्ट से सिर्फ़ ${km} किलोमीटर दूर हैं।`,
  catering: (list, outside) => `खाना हमारी अपनी रसोई से है: ${list}${outside ? ", या आप अपना कैटरर भी ला सकते हैं" : ""}।`,
  capacity: (n) => `हमारी सबसे बड़ी जगह में ${n} मेहमान आराम से बैठ सकते हैं।`,
  anythingElse: "क्या मैं और किसी चीज़ में मदद कर सकती हूँ?",
  goodbye: "विवाह को कॉल करने के लिए धन्यवाद। आपका दिन शुभ हो।",
  didNotCatch: "माफ़ कीजिए, ठीक से सुनाई नहीं दिया। क्या आप दोबारा बोलेंगे?",
  followUpOpen: (n) => `नमस्ते${n ? ` ${n}` : ""}, मैं विवाह बाय प्रमाण से बोल रही हूँ। एस्टेट देखने आने के लिए धन्यवाद। क्या आपके कोई सवाल हैं?`,
  followUpThanks: "धन्यवाद। मैंने टीम के लिए यह नोट कर लिया है।",
};

const ta: Phrasebook = {
  ...en,
  greeting: (rec) => `வணக்கம், விவாஹ் பை பிரமாண்-ஐ அழைத்ததற்கு நன்றி.${rec ? " சிறந்த சேவைக்காக இந்த அழைப்பு பதிவு செய்யப்படுகிறது." : ""} நான் எப்படி உதவலாம்?`,
  priceLocal: "எங்கள் விலைகள் உங்கள் தேதி, விருந்தினர் எண்ணிக்கை மற்றும் திட்டங்களைப் பொறுத்தது, எனவே நீங்கள் நேரில் வரும்போது தெரிவிக்கிறோம். எஸ்டேட்டைப் பார்க்க ஒரு நேரம் பதிவு செய்யட்டுமா?",
  discount: "தள்ளுபடி பற்றி என்னால் உறுதியளிக்க முடியாது, ஆனால் நீங்கள் வரும்போது குழு அனைத்தையும் மகிழ்ச்சியுடன் பேசும்.",
  transfer: "நிச்சயமாக, இப்போதே எங்கள் குழுவுடன் இணைக்கிறேன்.",
  unknown: "ஊகிப்பதற்குப் பதிலாக குழுவிடம் கேட்டு உங்களுக்குத் தெரிவிக்கிறேன்.",
  goodbye: "விவாஹ்-ஐ அழைத்ததற்கு நன்றி. இனிய நாள்.",
};

const te: Phrasebook = {
  ...en,
  greeting: (rec) => `నమస్కారం, వివాహ బై ప్రమాణ్‌కు కాల్ చేసినందుకు ధన్యవాదాలు.${rec ? " మెరుగైన సేవ కోసం ఈ కాల్ రికార్డ్ చేయబడుతోంది." : ""} నేను ఎలా సహాయం చేయగలను?`,
  priceLocal: "మా ధరలు మీ తేదీ, అతిథుల సంఖ్య మరియు ప్రణాళికలపై ఆధారపడి ఉంటాయి, కాబట్టి మీరు సందర్శించినప్పుడు నేరుగా చెబుతాము. ఎస్టేట్ చూడటానికి సమయం బుక్ చేయనా?",
  discount: "డిస్కౌంట్ గురించి నేను హామీ ఇవ్వలేను, కానీ మీరు వచ్చినప్పుడు టీమ్ అన్నీ సంతోషంగా చర్చిస్తుంది.",
  transfer: "తప్పకుండా, ఇప్పుడే మా టీమ్‌తో కలుపుతాను.",
  unknown: "ఊహించడం కంటే టీమ్‌ని అడిగి మీకు తెలియజేస్తాను.",
  goodbye: "వివాహకు కాల్ చేసినందుకు ధన్యవాదాలు. శుభదినం.",
};

export const PHRASES: Record<VoiceLang, Phrasebook> = { en, kn, hi, ta, te };

/** Plivo/Google speech codes per language. */
export const SPEECH_LOCALE: Record<VoiceLang, string> = { en: "en-IN", kn: "kn-IN", hi: "hi-IN", ta: "ta-IN", te: "te-IN" };

export function detectLanguage(text: string): VoiceLang | null {
  if (/[ಀ-೿]/.test(text) || /\bkannada\b|\bkannadalli\b/i.test(text)) return "kn";
  if (/[ऀ-ॿ]/.test(text) || /\bhindi\s+(?:me|mein)\b|\bhindi\b/i.test(text)) return "hi";
  if (/[஀-௿]/.test(text) || /\btamil\b/i.test(text)) return "ta";
  if (/[ఀ-౿]/.test(text) || /\btelugu\b/i.test(text)) return "te";
  return null;
}
