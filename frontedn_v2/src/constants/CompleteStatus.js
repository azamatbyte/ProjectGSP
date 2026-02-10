import i18n from "i18next";

export const CompleteStatus = [
  { value: "WAITING", label: i18n.t("waiting") },
  { value: "COMPLETED", label: i18n.t("completed") },
];

export const CompleteStatusOptions = CompleteStatus.map((item) => ({
  value: item.value,
  label: item.label,
}));

export const Model = [
  { value: "registration", label: i18n.t("registration") },
  { value: "registration4", label: i18n.t("registration4") },
];

export const ModelOptions = Model.map((item) => ({
  value: item.value,
  label: item.label,
}));

