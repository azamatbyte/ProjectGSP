import antdEnUS from "antd/es/locale/en_US";
import uzMsg from "../locales/uz_UZ.json";

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

const UzLang = {
  antd: {
    ...antdEnUS,
    Pagination: {
      ...antdEnUS.Pagination,
      ...uzPagination,
    },
    Table: {
      ...antdEnUS.Table,
      filterTitle: "Филтр",
      filterConfirm: "OK",
      filterReset: "Тозалаш",
      emptyText: "Маълумот йўқ",
    },
  },
  locale: "uz",
  messages: {
    ...uzMsg
  },
};
export default UzLang;
