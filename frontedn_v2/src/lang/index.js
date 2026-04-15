import antdEnUS from "antd/es/locale/en_US";
import antdRuRU from "antd/es/locale/ru_RU";
import ru from "./locales/ru_RU.json";
import uz from "./locales/uz_UZ.json";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { THEME_CONFIG } from "configs/AppConfig";

const uzPagination = {
    items_per_page: "/ сахифа",
    jump_to: "Ўтиш",
    jump_to_confirm: "тасдиқлаш",
    page: "Сахифа",
    prev_page: "Олдинги сахифа",
    next_page: "Кейинги сахифа",
    prev_5: "Олдинги 5 сахифа",
    next_5: "Кейинги 5 сахифа",
    prev_3: "Олдинги 3 сахифа",
    next_3: "Кейинги 3 сахифа",
    page_size: "Сахифа ҳажми",
};

const antdUzUZ = {
    ...antdEnUS,
    Pagination: {
        ...antdEnUS.Pagination,
        ...uzPagination,
    },
};

export const resources = {
    ru: {
        translation: ru,
        antd: antdRuRU
    },
    uz: {
        translation: uz,
        antd: antdUzUZ
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