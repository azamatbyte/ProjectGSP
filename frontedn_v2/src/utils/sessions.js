import { message } from "antd";
import SessionService from "services/SessionService";
import i18n from "i18next";

const createSession = async (id, type) => {
  try {
    await SessionService.create(id, type);
    message.success(i18n.t("save_to_main"));
  } catch (error) {
    message.error(i18n.t("order_already_exists"));
  }
};
export const SESSION_TYPES = {
  SESSION: "SESSION",
  RESERVE: "RESERVE",
  RAPORT: "RAPORT",
};

export const MODEL_TYPES = {
  ALL: "",
  REGISTRATION: "registration",
  REGISTRATION4: "registration4",
  RELATIVE: "relative",
  RELATIVEWITHOURSP: "relativeWithoutAnalysis",
};

const raports = [
  { key: "type123", label: i18n.t("OSUMVD_OSUSGB_USP") },
  { key: "type6", label: i18n.t("ND_ND1") },
  { key: "type7", label: i18n.t("ND_ND2") },
  { key: "type9", label: i18n.t("ЗАПРОС СГБ") },
  { key: "type8", label: i18n.t("ЗАПРОС ГСБП") },
  { key: "type4", label: i18n.t("AVR") },
  { key: "type5", label: i18n.t("UPK") },
  { key: "Заключение", label: i18n.t("Заключение") },
];

const malumotnomaRaports = [
  { key: "type10", label: i18n.t("bad_malumotnoma") },
  { key: "type11", label: i18n.t("good_malumotnoma") },
];

export const categoriesOfRaports = [...raports, ...malumotnomaRaports];

export default createSession;
