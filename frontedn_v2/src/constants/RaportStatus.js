import i18n from "i18next";

const raports = [
  { key: "type123", label: i18n.t("OSUMVD_OSUSGB_USP") },
  { key: "type6", label: i18n.t("ND_ND1") },
  { key: "type7", label: i18n.t("ND_ND2") },
  { key: "type4", label: i18n.t("AVR") },
  { key: "type5", label: i18n.t("UPK") },
];

const malumotnomaRaports = [
  { key: "type8", label: i18n.t("bad_malumotnoma") },
  { key: "type9", label: i18n.t("good_malumotnoma") },
  { key: "type11", label: i18n.t("OSUMVD_OSUSGB_USP") },
  { key: "Заключение", label: i18n.t("Заключение") },
];

export const RaportStatus = [...raports, ...malumotnomaRaports];

export const RaportStatusOptions = RaportStatus.map((item) => ({
  key: item.key,
  label: item.label,
}));
