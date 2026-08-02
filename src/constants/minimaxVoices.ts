/**
 * MiniMax T2A v2 system voices (English).
 *
 * Verified against MiniMax's official System Voice ID List
 * (https://platform.minimax.io/docs/faq/system-voice-id) plus the latest
 * additions named in the T2A reference (voice_setting docs). IDs are exact —
 * the API rejects unknown voice ids, so the picker must offer only what the
 * API accepts, and a custom/cloned voice id is the escape hatch.
 *
 * The provider falls back to DEFAULT_MINIMAX_VOICE when the profile carries
 * no explicit voiceId. The default is declared here too, so the picker can
 * highlight the voice that will actually be spoken even before the user
 * picks anything.
 */

export type MiniMaxVoiceOption = {
  /** The `voice_id` sent to `/v1/t2a_v2`. */
  id: string;
  /** Human name shown in Settings. */
  label: string;
};

/** Used when the profile has no explicit voiceId. */
export const DEFAULT_MINIMAX_VOICE = 'English_Graceful_Lady';

export const MINIMAX_VOICES: readonly MiniMaxVoiceOption[] = [
  { id: 'English_expressive_narrator', label: 'Expressive Narrator' },
  { id: 'English_radiant_girl', label: 'Radiant Girl' },
  { id: 'English_magnetic_voiced_man', label: 'Magnetic-voiced Male' },
  { id: 'English_compelling_lady1', label: 'Compelling Lady' },
  { id: 'English_Aussie_Bloke', label: 'Aussie Bloke' },
  { id: 'English_captivating_female1', label: 'Captivating Female' },
  { id: 'English_Upbeat_Woman', label: 'Upbeat Woman' },
  { id: 'English_Trustworth_Man', label: 'Trustworthy Man' },
  { id: 'English_CalmWoman', label: 'Calm Woman' },
  { id: 'English_UpsetGirl', label: 'Upset Girl' },
  { id: 'English_Gentle-voiced_man', label: 'Gentle-voiced Man' },
  { id: 'English_Whispering_girl', label: 'Whispering Girl' },
  { id: 'English_Diligent_Man', label: 'Diligent Man' },
  { id: 'English_Graceful_Lady', label: 'Graceful Lady' },
  { id: 'English_ReservedYoungMan', label: 'Reserved Young Man' },
  { id: 'English_PlayfulGirl', label: 'Playful Girl' },
  { id: 'English_ManWithDeepVoice', label: 'Man With Deep Voice' },
  { id: 'English_MaturePartner', label: 'Mature Partner' },
  { id: 'English_FriendlyPerson', label: 'Friendly Guy' },
  { id: 'English_MatureBoss', label: 'Bossy Lady' },
  { id: 'English_Debator', label: 'Male Debater' },
  { id: 'English_LovelyGirl', label: 'Lovely Girl' },
  { id: 'English_Steadymentor', label: 'Reliable Man' },
  { id: 'English_Deep-VoicedGentleman', label: 'Deep-voiced Gentleman' },
  { id: 'English_Wiselady', label: 'Wise Lady' },
  { id: 'English_CaptivatingStoryteller', label: 'Captivating Storyteller' },
  { id: 'English_DecentYoungMan', label: 'Decent Young Man' },
  { id: 'English_SentimentalLady', label: 'Sentimental Lady' },
  { id: 'English_ImposingManner', label: 'Imposing Queen' },
  { id: 'English_SadTeen', label: 'Teen Boy' },
  { id: 'English_PassionateWarrior', label: 'Passionate Warrior' },
  { id: 'English_WiseScholar', label: 'Wise Scholar' },
  { id: 'English_Soft-spokenGirl', label: 'Soft-Spoken Girl' },
  { id: 'English_SereneWoman', label: 'Serene Woman' },
  { id: 'English_ConfidentWoman', label: 'Confident Woman' },
  { id: 'English_PatientMan', label: 'Patient Man' },
  { id: 'English_Comedian', label: 'Comedian' },
  { id: 'English_BossyLeader', label: 'Bossy Leader' },
  { id: 'English_Strong-WilledBoy', label: 'Strong-Willed Boy' },
  { id: 'English_StressedLady', label: 'Stressed Lady' },
  { id: 'English_AssertiveQueen', label: 'Assertive Queen' },
  { id: 'English_AnimeCharacter', label: 'Female Narrator' },
  { id: 'English_Jovialman', label: 'Jovial Man' },
  { id: 'English_WhimsicalGirl', label: 'Whimsical Girl' },
  { id: 'English_Kind-heartedGirl', label: 'Kind-Hearted Girl' },
  // Latest additions named in the T2A v2 voice_setting reference.
  { id: 'English_Insightful_Speaker', label: 'Insightful Speaker' },
  { id: 'English_Persuasive_Man', label: 'Persuasive Man' },
  { id: 'English_Lucky_Robot', label: 'Lucky Robot' },
];
