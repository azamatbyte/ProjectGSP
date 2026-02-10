import antdEnUS from "antd/es/locale/en_US";
import antdRuRU from "antd/es/locale/ru_RU";
import ru from "./locales/ru_RU.json";
import uz from "./locales/uz_UZ.json";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { THEME_CONFIG } from "configs/AppConfig";

export const resources = {
    ru: {
        translation: ru,
        antd: antdRuRU
    },
    uz: {
        translation: uz,
        antd: antdEnUS
    }
};

i18n.use(initReactI18next).init({
    resources,
    fallbackLng: THEME_CONFIG.locale,
    lng: THEME_CONFIG.locale,
    interpolation: {
        escapeValue: false 
    }
});

export default i18n;