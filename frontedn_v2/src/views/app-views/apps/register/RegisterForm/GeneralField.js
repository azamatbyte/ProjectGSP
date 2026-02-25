import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  Input,
  Row,
  Col,
  Card,
  Form,
  Select,
  DatePicker,
  InputNumber,
  Modal,
  message,
  Checkbox,
  AutoComplete,
} from "antd";
import dayjs from "dayjs";
import { Button } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import debounce from "lodash/debounce";
import WorkPlaceService from "services/WorkPlaceService";
import FormService from "services/FormService";
import RegistrationService from "services/RegistrationService";
import InitiatorService from "services/InitiatorService";
import RelativeService from "services/RelativeService";
import RelationService from "services/RelationlaceService";
import { DATE_FORMAT_DD_MM_YYYY_WITH_DOT } from "constants/DateConstant";
import AccessStatusService from "services/AccessStatusService";
import { useTranslation } from "react-i18next";
import RelativeTable from "./RelativeTable";
import { CompleteStatus } from "constants/CompleteStatus";
import { MODEL_TYPES } from "utils/sessions";

const { Option } = Select;

// API chaqiruv funksiyasi
const fetchWorkplaces = async (searchText) => {
  try {
    // Bu yerda haqiqiy API manzilini ko'rsating
    const response = await WorkPlaceService.getList(1, 5, searchText);

    return response?.data?.workplaces;
  } catch (error) {
    console.error("Xatolik:", error);
    return [];
  }
};

const fetchAccessStatus = async (searchText) => {
  try {
    const response = await AccessStatusService.listWithStatus(
      1,
      25,
      searchText
    );
    return response?.data?.accessStatuses;
  } catch (error) {
    console.error("Xatolik:", error);
    return [];
  }
};

const fetchInitiators = async (searchText) => {
  try {
    const response = await InitiatorService.getList(1, 5, searchText);
    console.log("response", response);
    return response?.data?.data?.map((item) => ({
      full_name: item?.first_name + " " + item?.last_name,
      id: item?.id,
    }));
  } catch (error) {
    console.error("Xatolik:", error);
    return [];
  }
};

const fetchRelationDegree = async (searchText) => {
  try {
    const response = await RelationService.getRelationList(1, 25, searchText);
    return response?.data?.relationDegrees;
  } catch (error) {
    console.error("Xatolik:", error);
    return [];
  }
};

// Debounced versiyasi checkRegNumber funksiyasining

const GeneralField = (props) => {
  const { t, i18n } = useTranslation();
  const { mode, id, model, modelProps, executorFullName } = props;
  const [workplaceOptions, setWorkplaceOptions] = useState([]);
  const [formOptions, setFormOptions] = useState([]);
  const [accessStatusOptions, setAccessStatusOptions] = useState([]);
  const [initiatorOptions, setInitiatorOptions] = useState([]);
  const [workplaceFetching, setWorkplaceFetching] = useState(false);
  const [initiatorFetching, setInitiatorFetching] = useState(false);
  const [relationDegreeOptions, setRelationDegreeOptions] = useState([]);
  const [relationDegreeFetching, setRelationDegreeFetching] = useState(false);
  const [accessStatusFetching, setAccessStatusFetching] = useState(false);
  const firstNameInputRef = useRef(null);
  const birthDateWrapperRef = useRef(null);
  const birthPlaceSearchRef = useRef("");
  const [isReadOnly, setIsReadOnly] = useState(false);
  const conclusionRegNumValue = Form.useWatch("conclusionRegNum", props.form);

  const [dataSource, setDataSource] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);

  const [relativePageSize, setRelativePageSize] = useState(10);
  const [relativePageNumber, setRelativePageNumber] = useState(1);
  const [relativeTotal, setRelativeTotal] = useState(0);

  const [relativeForm] = Form.useForm();
  const [completeStatusValue, setCompleteStatusValue] = useState("WAITING");
  const [formType, setFormType] = useState("year");

  const initialRelativeData = {
    id: "",
    firstName: "",
    lastName: "",
    fatherName: "",
    relationDegree: "",
    birthDate: null,
    birthPlace: "",
    residence: "",
    workplace: "",
    position: "",
    notes: "",
    additionalNotes: "",
    accessStatus: "",
    createdAt: "",
    updatedAt: "",
    pinfl: "",
    birthYear: null,
    model: "relative",
    conclusion_compr: "",
  };

  const [persistentRelativeData, setPersistentRelativeData] =
    useState(initialRelativeData);
  const [relativeData, setRelativeData] = useState(initialRelativeData);

  const fetchForms = useCallback(
    async (searchText, model) => {
      try {
        const response = await FormService.listWithStatus(
          1,
          15,
          searchText,
          mode === "ADD" ? "registration" : model
        );
        return response?.data?.forms;
      } catch (error) {
        console.error(t("error"), error);
        return [];
      }
    },
    [mode, t]
  );
  // DB tekshirish funksiyasi (buni o'zingizning API chaqiruvingiz bilan almashtiring)
  const checkRegNumberInDB = async (value) => {
    // API chaqiruvi namunasi
    try {
      if (mode === "EDIT") {
        const response = await RegistrationService.checkRegNumber(value, id);
        if (response.status === 200) {
          return true;
        }
        return false;
      } else {
        const response = await RegistrationService.checkRegNumber(value);
        if (response.status === 200) {
          return true;
        }
        return false;
      }
    } catch (error) {
      console.error(t("error_checking_reg_number"), error);
      throw error;
    }
  };
  const showModal = () => {
    setIsModalVisible(true);
    setRelativeData(persistentRelativeData); // Load persistent data into modal
    relativeForm.setFieldsValue(persistentRelativeData);
    // Focus on lastName input after modal opens
    setTimeout(() => {
      if (firstNameInputRef.current) {
        firstNameInputRef.current.focus();
      }
    }, 100);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    setPersistentRelativeData(relativeData); // Save current modal data as persistent
  };

  const debouncedCheckRegNumber = debounce((value, resolve, reject) => {
    checkRegNumberInDB(value)
      .then((isValid) => {
        if (isValid) {
          resolve();
        } else {
          reject(t("reg_number_already_exists"));
        }
      })
      .catch(() => {
        reject(t("error_checking_reg_number"));
      });
  }, 500);

  useEffect(() => {
    if (isModalVisible && firstNameInputRef.current) {
      firstNameInputRef.current.focus(); // Focus on the First Name input when modal opens
    }
  }, [isModalVisible]);

  useEffect(() => {
    const fetchData = async () => {
      const data = await fetchForms("", model);
      const accessStatuses = await fetchAccessStatus("");
      const initiators = await fetchInitiators("");
      const relationDegrees = await fetchRelationDegree("");
      const workplaces = await fetchWorkplaces("");
      setFormOptions(
        data.map((item) => ({
          value: item?.name,
          label: item?.name,
        }))
      );
      setAccessStatusOptions(
        accessStatuses.map((item) => ({
          value: item?.name,
          label: item?.name,
        }))
      );
      setInitiatorOptions(
        initiators.map((item) => ({
          value: item?.id,
          label: item?.full_name,
          id: item?.id,
        }))
      );
      setRelationDegreeOptions(
        relationDegrees.map((item) => ({
          value: item?.name,
          label: item?.name,
        }))
      );
      setWorkplaceOptions(
        workplaces.map((item) => ({
          value: item?.name,
          label: item?.name,
        }))
      );
    };
    fetchData();
  }, [model, fetchForms]);

  useEffect(() => {
    setIsReadOnly(props.isReadOnly);
  }, [props.isReadOnly]);

  // Enable dd.mm.yyyy masking and Enter/Tab navigation for BirthDate (tabIndex 9 → 10)
  useEffect(() => {
    if (isReadOnly) return;
    const root = birthDateWrapperRef.current;
    if (!root) return;
    const inputEl = root.querySelector("input");
    if (!inputEl) return;

    const formatToMask = (raw) => {
      const digits = (raw || "").replace(/\D/g, "").slice(0, 8);
      const len = digits.length;
      const day = digits.slice(0, 2);
      const month = digits.slice(2, 4);
      const year = digits.slice(4, 8);
      if (len <= 2) return day + (len === 2 ? "." : "");
      if (len <= 4) return day + "." + month + (len === 4 ? "." : "");
      return day + "." + month + "." + year;
    };

    const backspaceOverDotRef = { current: false };

    const handleInput = (e) => {
      const before = e.target.value;
      let masked = formatToMask(before);
      if (backspaceOverDotRef.current) {
        const digits = (before || "").replace(/\D/g, "").slice(0, 8);
        if (digits.length === 2 || digits.length === 4) masked = masked.replace(/\.$/, "");
      }
      if (before !== masked) {
        const pos = masked.length;
        e.target.value = masked;
        try {
          e.target.setSelectionRange(pos, pos);
        } catch (_) { }
      }
    };

    const handleKeyDown = (e) => {
      // Track backspace over dot
      if (e.key === "Backspace") {
        const pos = e.target.selectionStart || 0;
        const val = e.target.value || "";
        backspaceOverDotRef.current = pos > 0 && val.charAt(pos - 1) === ".";
      } else {
        backspaceOverDotRef.current = false;
      }

      // Enter/Tab → move to next tabbable (tabIndex 10)
      if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
        const next = document.querySelector('[tabindex="10"]');
        if (next) {
          e.preventDefault();
          // Blur to let antd parse the value according to format
          e.target.blur();
          // Delay focus to ensure value commits
          setTimeout(() => next.focus(), 0);
        }
      }
    };

    inputEl.addEventListener("input", handleInput);
    inputEl.addEventListener("keydown", handleKeyDown);
    return () => {
      inputEl.removeEventListener("input", handleInput);
      inputEl.removeEventListener("keydown", handleKeyDown);
    };
  }, [isReadOnly]);

  const handleAdd = async () => {
    try {
      relativeData.relationship = props.id;
      relativeData.or_tab = props.initiatorId;
      if (!relativeData?.model) {
        relativeData.model = "relative";
      }
      const response = await RelativeService.create(relativeData);
      console.log("Response:", response);
      const newItem = {
        ...response?.data?.data,
        key: response?.data?.data?.id || dataSource.length + 1,
      };
      setDataSource((prev) => [...prev, newItem]);
      message.success(t("record_added_successfully"));
      setIsReadOnly(true);
      setPersistentRelativeData(relativeData);
    } catch (error) {
      console.error(t("error"), error);
      message.error(t("error_adding_record"));
    }
  };

  const debouncedFetchWorkplaces = debounce(async (searchText) => {
    if (searchText.length > 2) {
      setWorkplaceFetching(true);
      const data = await fetchWorkplaces(searchText);
      setWorkplaceOptions(
        data.map((item) => ({
          value: item.name,
          label: item.name,
        }))
      );
      setWorkplaceFetching(false);
    }
  }, 500);

  const debouncedFetchAccessStatus = debounce(async (searchText) => {
    if (searchText.length >= 1) {
      setAccessStatusFetching(true);
      const data = await fetchAccessStatus(searchText);
      setAccessStatusOptions(
        data.map((item) => ({
          value: item.name,
          label: item.name,
        }))
      );
      setAccessStatusFetching(false);
    }
  }, 500);

  const debouncedFetchRelationDegree = debounce(async (searchText) => {
    if (searchText.length >= 1) {
      setRelationDegreeFetching(true);
      const data = await fetchRelationDegree(searchText);
      setRelationDegreeOptions(
        data.map((item) => ({
          value: item.name,
          label: item.name,
        }))
      );
      setRelationDegreeFetching(false);
    }
  }, 500);

  const debouncedFetchInitiators = debounce(async (searchText) => {
    setInitiatorFetching(true);
    const initiators = await fetchInitiators(searchText || "");
    setInitiatorOptions(
      initiators.map((item) => ({
        value: item?.id,
        label: item?.full_name,
        id: item?.id,
      }))
    );
    setInitiatorFetching(false);
  }, 500);

  const setConclusion = (value) => {
    if (
      value.target.checked &&
      props.form.getFieldValue("regNumber") &&
      props.form.getFieldValue("form_reg")
    ) {
      const conclusionRegNum =
        props.form.getFieldValue("regNumber") +
        " ф-" +
        props.form.getFieldValue("form_reg");
      props.form.setFieldsValue({ conclusionRegNum: conclusionRegNum });
    } else {
      props.form.setFieldsValue({ conclusionRegNum: "" });
    }
  };

  // const handleEdit = () => {
  //   setIsEdit(true);
  // };

  const relativeModelOptions = [
    { value: "relative", label: t("relative") },
    { value: "relativeWithoutAnalysis", label: t("relativeWithoutAnalysis") },
  ];

  const rules = {
    regnumber: [
      {
        required: true,
        message: t("please_enter_the_registration_number"),
      },
      ({ getFieldValue }) => ({
        validator(_, value) {
          if (!value) return Promise.resolve();
          return new Promise((resolve, reject) => {
            debouncedCheckRegNumber(value, resolve, reject);
          });
        },
        validateTrigger: ["onChange"],
      }),
    ],
    completeStatus: [
      {
        // required: true,
        defaultValue: "WAITING",
        message: t("required_field"),
      },
    ],
    error: [
      {
        required: true,
        message: t("required_field"),
      },
    ],
  };

  const handleClearModal = () => {
    setPersistentRelativeData(initialRelativeData);
    setRelativeData(initialRelativeData);
    relativeForm.resetFields();
  };

  const registrationRules = rules.error;
  const defaultRules = [];

  const regions = [
    { uz: "Андижон вилояти", ru: "Андижанская область" },
    { uz: "Бухоро вилояти", ru: "Бухарская область" },
    { uz: "Фарғона вилояти", ru: "Ферганская область" },
    { uz: "Жиззах вилояти", ru: "Джизакская область" },
    { uz: "Наманган вилояти", ru: "Наманганская область" },
    { uz: "Навои вилояти", ru: "Навоийская область" },
    { uz: "Қашқадарё вилояти", ru: "Кашкадарьинская область" },
    { uz: "Самарқанд вилояти", ru: "Самаркандская область" },
    { uz: "Сирдарё вилояти", ru: "Сырдарьинская область" },
    { uz: "Сурхандарё вилояти", ru: "Сурхандарьинская область" },
    { uz: "Тошкент вилояти", ru: "Ташкентская область" },
    { uz: "Тошкент шаҳри", ru: "г. Ташкент" },
    { uz: "Хоразм вилояти", ru: "Хорезмская область" },
    { uz: "Қорақалпоғистон республикаси", ru: "Каракалпакстанская республика" },
  ];

  const lang = i18n.language;
  const regionOptions = regions.map((r) => ({
    value: lang === "ru" ? r.ru : r.uz,
    label: lang === "ru" ? r.ru : r.uz,
  }));

  const pickerRef = useRef(null);

  // Foydalanuvchi kiritgan matnni ham variant sifatida ko'rsatish
  const [searchValue, setSearchValue] = useState("");

  const birthPlaceOptions = useMemo(() => {
    const currentTyped = (searchValue || relativeData.birthPlace || "").trim();
    if (currentTyped && !regionOptions.some((o) => o.value === currentTyped)) {
      return [
        {
          value: currentTyped,
          label: currentTyped,
          // className: "custom-typed-option" // Kiritilgan matn uchun maxsus class
        },
        ...regionOptions
      ];
    }
    return regionOptions;
  }, [regionOptions, relativeData.birthPlace, searchValue]);

  return (
    <Row gutter={16}>
      <Col xs={24} sm={24} md={17}>
        <Card title={t("basic_info")}>
          <Row gutter={16}>
            <Col xs={24} sm={24} md={12}>
              <Row gutter={24}>
                <Col xs={24} sm={12} md={10}>
                  <Form.Item
                    name="form_reg"
                    label={t("form")}
                    rules={rules.error}
                    maxLength={255}
                  >
                    <Select
                      className="w-100"
                      style={{ minWidth: 80 }}
                      // placeholder={t('select_form')}
                      onChange={(value) => {
                        props.form.setFieldsValue({ form_reg: value });
                      }}
                      tabIndex={1}
                      autoFocus
                      disabled={isReadOnly}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const nextInput = document.querySelector("[tabindex=\"2\"]");
                          if (nextInput) nextInput.focus();
                        }
                      }}
                    >
                      {formOptions.map((option) => (
                        <Option key={option.value} value={option.value}>
                          {option.label}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={14}>
                  <Form.Item
                    name="regNumber"
                    label={t("reg_number")}
                    rules={rules.regnumber}
                    maxLength={255}
                    hasFeedback
                    validateTrigger={["onChange"]}
                  >
                    <Input
                      className="w-100"
                      tabIndex={2}
                      disabled={isReadOnly}
                      maxLength={255}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const nextInput = document.querySelector("[tabindex=\"3\"]");
                          if (nextInput) nextInput.focus();
                        }
                      }}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Row gutter={24}>
                <Col xs={24} sm={12} md={10}>
                  <Form.Item
                    name="regDate"
                    label={t("reg_date")}
                    initialValue={dayjs()}
                    rules={rules.error}
                    disabled={isReadOnly}
                  >
                    <DatePicker
                      format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT}
                      className="w-100"
                      tabIndex={3}
                      onChange={() => {
                        props.form.setFieldsValue({
                          completeStatus: "WAITING",
                        });
                        setCompleteStatusValue("WAITING");
                      }}
                      disabled={isReadOnly}
                      onBlur={(e) => {
                        const input = e.target.value;
                        if (/^\d{8}$/.test(input)) {
                          const parsed = dayjs.utc(input, "DDMMYYYY", true);
                          if (parsed.isValid()) {
                            // Use the correct form reference
                            props.form.setFieldsValue({ regDate: parsed });
                            // Update the input display to show formatted date
                            e.target.value = parsed.format(DATE_FORMAT_DD_MM_YYYY_WITH_DOT);
                          }
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Tab") {
                          const input = e.target.value;
                          if (/^\d{8}$/.test(input)) {
                            const parsed = dayjs.utc(input, "DDMMYYYY", true);
                            if (parsed.isValid()) {
                              // Use the correct form reference
                              props.form.setFieldsValue({ regDate: parsed });
                              // Update the input display to show formatted date
                              e.target.value = parsed.format(DATE_FORMAT_DD_MM_YYYY_WITH_DOT);
                            }
                          }

                          if (e.key === "Enter") {
                            e.preventDefault();
                            const nextInput = document.querySelector("[tabindex=\"4\"]");
                            if (nextInput) nextInput.focus();
                          }
                        }
                      }}
                      onInput={(e) => {
                        const input = e.target;
                        const value = input.value.replace(/\D/g, ""); // faqat raqamlarni olish

                        // Auto-format yozish vaqtida
                        const digits = value.slice(0, 8);
                        const len = digits.length;
                        const day = digits.slice(0, 2);
                        const month = digits.slice(2, 4);
                        const year = digits.slice(4, 8);

                        let masked = "";
                        if (len <= 2) {
                          masked = day + (len === 2 ? "." : "");
                        } else if (len <= 4) {
                          masked = day + "." + month + (len === 4 ? "." : "");
                        } else {
                          masked = day + "." + month + "." + year;
                        }

                        if (input.value !== masked) {
                          setTimeout(() => {
                            input.value = masked;
                            const pos = masked.length;
                            try {
                              input.setSelectionRange(pos, pos);
                            } catch (_) { }
                          }, 0);
                        }
                      }}
                      onInputKeyDown={(e) => {
                        const input = e.target;
                        const value = input.value.replace(/\D/g, ''); // Remove non-digits

                        // Auto-format as user types
                        if (e.key !== "Backspace" && e.key !== "Delete" && e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Enter" && e.key !== "Tab") {
                          const digits = value.slice(0, 8);
                          const len = digits.length;
                          const day = digits.slice(0, 2);
                          const month = digits.slice(2, 4);
                          const year = digits.slice(4, 8);

                          let masked = "";
                          if (len <= 2) {
                            masked = day + (len === 2 ? "." : "");
                          } else if (len <= 4) {
                            masked = day + "." + month + (len === 4 ? "." : "");
                          } else {
                            masked = day + "." + month + "." + year;
                          }

                          if (input.value !== masked) {
                            setTimeout(() => {
                              input.value = masked;
                              const pos = masked.length;
                              try {
                                input.setSelectionRange(pos, pos);
                              } catch (_) { }
                            }, 0);
                          }
                        }
                      }}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={14}>
                  <Form.Item
                    name="or_tab"
                    label={t("initiator")}
                    rules={rules.error}
                  >
                    <Select
                      showSearch
                      className="w-100"
                      allowClear
                      // placeholder={t('select_initiator')}
                      style={{ width: 200, cursor: "pointer" }}
                      optionFilterProp="children"
                      onChange={(value, option) => {
                        props.form.setFieldsValue({
                          or_tab: value,
                        });
                      }}
                      onSearch={debouncedFetchInitiators}
                      onClear={() => {
                        // Clear qilganda barcha initiatorlarni ko'rsatish
                        debouncedFetchInitiators("");
                      }}
                      loading={initiatorFetching}
                      filterOption={false}
                      tabIndex={4}
                      options={initiatorOptions}
                      disabled={isReadOnly}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const nextInput = document.querySelector("[tabindex=\"5\"]");
                          if (nextInput) nextInput.focus();
                        }
                      }}
                    />
                  </Form.Item>
                </Col>
                
              </Row>
            </Col>
            <Col xs={24} sm={24} md={8}>
              <Form.Item
                name="last_name"
                label={t("last_name")}
                rules={rules.error}
              >
                <Input
                  className="w-100"
                  min={0}
                  maxLength={255}
                  tabIndex={5}
                  disabled={isReadOnly}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if ((e.target.value || "").trim()) {
                        const nextInput = document.querySelector('[tabindex="6"]');
                        if (nextInput) nextInput.focus();
                      }
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={8}>
              <Form.Item
                name="first_name"
                label={t("first_name")}
                rules={rules.error}
              >
                <Input
                  className="w-100"
                  min={0}
                  maxLength={255}
                  tabIndex={6}
                  disabled={isReadOnly}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if ((e.target.value || "").trim()) {
                        const nextInput = document.querySelector('[tabindex="7"]');
                        if (nextInput) nextInput.focus();
                      }
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={8}>
              <Form.Item
                name="father_name"
                label={t("father_name")}
                rules={
                  modelProps === MODEL_TYPES.REGISTRATION
                    ? registrationRules
                    : defaultRules
                }
              >
                <Input
                  className="w-100"
                  maxLength={255}
                  tabIndex={7}
                  disabled={isReadOnly}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if ((e.target.value || "").trim()) {
                        const nextInput = document.querySelector('[tabindex="8"]');
                        if (nextInput) nextInput.focus();
                      }
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              {model === "registration4" ? (
                <Form.Item
                  name="birthYear"
                  label={t("birth_year")}
                  rules={rules.error}
                >
                  <Input
                    className="w-100"
                    tabIndex={8}
                    placeholder={t("birth_year_placeholder")}
                    type="number"
                    maxLength={255}
                    disabled={isReadOnly}
                  />
                </Form.Item>
              ) : (
                <Form.Item
                  name="birthDate"
                  label={t("birth_date")}
                  rules={rules.error}
                >
                  <DatePicker
                    format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT}
                    className="w-100"
                    tabIndex={8}
                    disabled={isReadOnly}
                    onBlur={(e) => {
                      const input = e.target.value;
                      if (/^\d{8}$/.test(input)) {
                        const parsed = dayjs.utc(input, "DDMMYYYY", true);
                        if (parsed.isValid()) {
                          // Use the correct form reference
                          props.form.setFieldsValue({ birthDate: parsed });
                          // Update the input display to show formatted date
                          e.target.value = parsed.format(DATE_FORMAT_DD_MM_YYYY_WITH_DOT);
                        }
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "Tab") {
                        const input = e.target.value;
                        if (/^\d{8}$/.test(input)) {
                          const parsed = dayjs.utc(input, "DDMMYYYY", true);
                          if (parsed.isValid()) {
                            // Use the correct form reference
                            props.form.setFieldsValue({ birthDate: parsed });
                            // Update the input display to show formatted date
                            e.target.value = parsed.format(DATE_FORMAT_DD_MM_YYYY_WITH_DOT);
                          }
                        }

                        if (e.key === "Enter") {
                          e.preventDefault();
                          const nextInput = document.querySelector("[tabindex=\"10\"]");
                          if (nextInput) nextInput.focus();
                        }
                      }
                    }}
                    onInputKeyDown={(e) => {
                      const input = e.target;
                      const value = input.value.replace(/\D/g, ''); // Remove non-digits

                      // Auto-format as user types
                      if (e.key !== "Backspace" && e.key !== "Delete" && e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Enter" && e.key !== "Tab") {
                        const digits = value.slice(0, 8);
                        const len = digits.length;
                        const day = digits.slice(0, 2);
                        const month = digits.slice(2, 4);
                        const year = digits.slice(4, 8);

                        let masked = "";
                        if (len <= 2) {
                          masked = day + (len === 2 ? "." : "");
                        } else if (len <= 4) {
                          masked = day + "." + month + (len === 4 ? "." : "");
                        } else {
                          masked = day + "." + month + "." + year;
                        }

                        if (input.value !== masked) {
                          setTimeout(() => {
                            input.value = masked;
                            const pos = masked.length;
                            try {
                              input.setSelectionRange(pos, pos);
                            } catch (_) { }
                          }, 0);
                        }
                      }
                    }}
                  />
                </Form.Item>
              )}
            </Col>
            {modelProps === "registration" && (
              <Col xs={24} sm={24} md={12}>
                <Form.Item name="nationality" label={t("nationality")}>
                  <Input
                    className="w-100"
                    tabIndex={10}
                    disabled={isReadOnly}
                    maxLength={255}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if ((e.target.value || "").trim()) {
                          const nextInput = document.querySelector('[tabindex="10"]');
                          if (nextInput) nextInput.focus();
                        }
                      }
                    }}
                  />
                </Form.Item>
              </Col>
            )}
            <Col xs={24} sm={24} md={12}>
              <Form.Item label={t("birth_place")} required name="birthPlace">
                <Select
                  className="w-100"
                  placeholder={t("birth_place")}
                  showSearch
                  allowClear
                  disabled={isReadOnly}
                  style={{ width: 200, cursor: "pointer" }}
                  optionFilterProp="children"
                  value={relativeData.birthPlace}
                  onSearch={(val) => {
                    const typed = (val || "").trim();
                    birthPlaceSearchRef.current = typed;
                    setSearchValue(typed);
                    // Qidiruv natijalarini yangilash uchun dropdown'ni qayta render qilamiz
                    // Bu dropdown'da kiritilgan matn va uning ostida mos keluvchi variantlarni ko'rsatadi
                  }}
                  filterOption={(input, option) => {
                    const inputValue = (input || "").toLowerCase();
                    const optionValue = (option?.label ?? option?.value ?? "").toLowerCase();

                    // Agar bu kiritilgan matn bo'lsa, har doim ko'rsatamiz
                    if (option.className === "custom-typed-option") {
                      return true;
                    }

                    // Boshqa variantlar uchun qidiruv
                    return optionValue.includes(inputValue);
                  }}
                  tabIndex={10}
                  options={birthPlaceOptions}
                  onChange={(value, option) => {
                    // Select item tanlanganda doim tanlangan qiymatni yozamiz
                    const chosen = typeof value === 'string' ? value : '';
                    if (chosen) {
                      props.form.setFieldsValue({ birthPlace: chosen });
                      birthPlaceSearchRef.current = chosen;
                      setSearchValue(chosen);
                    }
                  }}
                  onClear={() => {
                    birthPlaceSearchRef.current = "";
                    setSearchValue("");
                    props.form.setFieldsValue({ birthPlace: "" });
                  }}
                  onSelect={(value, option) => {
                    // Dropdown'dan tanlanganda keyingi input'ga o'tish
                    setTimeout(() => {
                      const nextInput = document.querySelector("[tabindex=\"11\"]");
                      if (nextInput) nextInput.focus();
                    }, 100);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const dropdownOpen = !!document.querySelector('.ant-select-dropdown');
                      const activeOption = document.querySelector('.ant-select-item-option-active');

                      if (dropdownOpen && activeOption) {
                        // Dropdown ochiq va aktiv element bo'lsa, uni tanlashga ruxsat beramiz
                        // Antd o'zi tanlangan elementni o'rnatadi va keyingi input'ga o'tadi
                        return;
                      }

                      // Dropdown ochiq emas yoki aktiv element yo'q bo'lsa, kiritilgan matnni saqlaymiz
                      const typed = (e.target?.value ?? birthPlaceSearchRef.current ?? "").trim();
                      if (typed.length > 0) {
                        e.preventDefault();
                        props.form.setFieldsValue({ birthPlace: typed });
                        birthPlaceSearchRef.current = typed;
                        setSearchValue(typed);
                        const nextInput = document.querySelector("[tabindex=\"11\"]");
                        if (nextInput) nextInput.focus();
                      }
                    }
                  }}
                  // Qo'lda kiritish uchun:
                  onInputKeyDown={(e) => {
                    if (e.key === "Tab" && !e.shiftKey) {
                      const dropdownOpen = !!document.querySelector('.ant-select-dropdown');
                      const activeOption = document.querySelector('.ant-select-item-option-active');

                      if (dropdownOpen && activeOption) {
                        // Dropdown ochiq va aktiv element bo'lsa, uni tanlashga ruxsat beramiz
                        return;
                      }

                      // Dropdown ochiq emas yoki aktiv element yo'q bo'lsa, kiritilgan matnni saqlaymiz
                      const val = e.target?.value;
                      if (val) {
                        e.preventDefault();
                        props.form.setFieldsValue({ birthPlace: val });
                        birthPlaceSearchRef.current = val;
                        setSearchValue(val);
                        const next = document.querySelector('[tabindex="11"]');
                        setTimeout(() => next?.focus(), 0);
                      }
                    }
                  }}
                  onBlur={() => {
                    const typed = (birthPlaceSearchRef.current ?? "").trim();
                    // Focus yo'qolganida kiritilgan matnni saqlaymiz
                    if (typed.length > 0) {
                      props.form.setFieldsValue({ birthPlace: typed });
                      setSearchValue(typed);
                    }
                  }}
                  onDropdownVisibleChange={(open) => {
                    if (!open) {
                      const typed = (birthPlaceSearchRef.current ?? "").trim();
                      // Dropdown yopilganida kiritilgan matnni saqlaymiz
                      if (typed.length > 0) {
                        props.form.setFieldsValue({ birthPlace: typed });
                        setSearchValue(typed);
                      }
                    }
                  }}
                >
                </Select>
              </Form.Item>

            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="residence" label={t("residence")}>
                <Input
                  className="w-100"
                  min={0}
                  maxLength={255}
                  tabIndex={11}
                  disabled={isReadOnly}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if ((e.target.value || "").trim()) {
                        const nextInput = document.querySelector('[tabindex="12"]');
                        if (nextInput) nextInput.focus();
                      }
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="workplace" label={t("workplace")}>
                <Select
                  className="w-100"
                  placeholder={t("workplace")}
                  showSearch
                  style={{ width: 200, cursor: "pointer" }}
                  optionFilterProp="children"
                  onChange={(value) => {
                    props.form.setFieldsValue({ workplace: value });
                  }}
                  onSearch={(searchText) => {
                    if (searchText.length === 0) {
                      // Agar qidiruv matni bo'sh bo'lsa, barcha natijalarni qayta yuklash
                      fetchWorkplaces("").then((data) => {
                        setWorkplaceOptions(
                          data.map((item) => ({
                            value: item.name,
                            label: item.name,
                          }))
                        );
                      });
                    } else {
                      debouncedFetchWorkplaces(searchText);
                    }
                  }}
                  loading={workplaceFetching}
                  filterOption={false}
                  tabIndex={12}
                  options={workplaceOptions}
                  disabled={isReadOnly}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const nextInput = document.querySelector("[tabindex=\"13\"]");
                      if (nextInput) nextInput.focus();
                    }
                  }}
                />
              </Form.Item>
            </Col>
            {modelProps === "registration" && (
              <Col xs={24} sm={24} md={12}>
                <Form.Item name="position" label={t("sub_department")}>
                  <Input
                    className="w-100"
                    min={0}
                    max={100}
                    tabIndex={13}
                    disabled={isReadOnly}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if ((e.target.value || "").trim()) {
                          const nextInput = document.querySelector('[tabindex="14"]');
                          if (nextInput) nextInput.focus();
                        }
                      }
                    }}
                  />
                </Form.Item>
              </Col>
            )}
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="recordNumber" label={t("record_list")}>
                <Input
                  className="w-100"
                  style={{ minWidth: 90 }}
                  tabIndex={14}
                  disabled={isReadOnly}
                  maxLength={255}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if ((e.target.value || "").trim()) {
                        const nextInput = document.querySelector('[tabindex="14"]');
                        if (nextInput) nextInput.focus();
                      }
                    }
                  }}
                // placeholder={t('record_number_placeholder')}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="pinfl" label={t("pinfl")}>
                <Input
                  className="w-100"
                  style={{ minWidth: 90 }}
                  tabIndex={14}
                  disabled={isReadOnly}
                  maxLength={255}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if ((e.target.value || "").trim()) {
                        const nextInput = document.querySelector('[tabindex="15"]');
                        if (nextInput) nextInput.focus();
                      }
                    }
                  }}
                // placeholder={t('record_number_placeholder')}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="passport" label={t("passport")}>
                <Input
                  className="w-100"
                  style={{ minWidth: 90 }}
                  tabIndex={15}
                  disabled={isReadOnly}
                  maxLength={255}
                />
              </Form.Item>
            </Col>
            {mode === "EDIT" && (
                  <Col xs={24} sm={24} md={12}>
                    <Form.Item label={t("executor")}>
                      <Input
                        className="w-100"
                        value={executorFullName || "-"}
                        readOnly
                        disabled
                      />
                    </Form.Item>
                  </Col>
                )}
            <Col xs={24} sm={24} md={24}>
              <Form.Item name="notes" label={t("compr_info")} style={{ flex: 1 }}>
                <Input.TextArea
                  className="w-100"
                  style={{ height: "80px", resize: "none" }} // Ensure it takes full height and disable resizing
                  disabled={isReadOnly}
                />
              </Form.Item>
            </Col>
            {/* {mode !== "ADD" && (
              <Col xs={24} sm={24} md={12}>
                <Form.Item name="model1" label={t("model")}>
                  <Select
                    className="w-100"
                  style={{ minWidth: 180 }}
                  placeholder={t("select_a_form")}
                  onChange={(value) => {
                    props.form.setFieldsValue({ form_reg: null });
                    props.form.setFieldsValue({ model1: value });
                    fetchFormOptions(value);
                  }}
                  disabled={isReadOnly}
                  maxLength={255}
                >
                  {ModelOptions.map((option) => (
                    <Option key={option.value} value={option.value}>
                      {option.label}
                    </Option>
                  ))}
                </Select>
                </Form.Item>
              </Col>
            )} */}
          </Row>
          <Row justify="space-between" style={{ marginTop: "20px" }}>
            {/* {mode === "EDIT" ? (
              <Col>
                <Button
                  type="primary"
                  onClick={handleEdit}
                  htmlType="submit"
                  tabIndex={15}
                  style={{ width: "120px" }}
                >
                  {t("edit")}
                </Button>
              </Col>
            ) : (
              <Col></Col>
            )} */}
            <Col></Col>
            <Col>
              <Button
                type="primary"
                htmlType="submit"
                tabIndex={15}
                style={{ width: "120px" }}
                disabled={isReadOnly}
              >
                {t("save")}
              </Button>
            </Col>
          </Row>
        </Card>
      </Col>
      <Col xs={24} sm={24} md={7}>
        <Card>
          <Col xs={24} sm={24} md={24}>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label={t("status")}>
                  <Checkbox.Group value={!!conclusionRegNumValue ? ["conclusion"] : []}>
                    <Row>
                      <Col span={12}>
                        <Checkbox
                          value="conclusion"
                          onClick={(e) => setConclusion(e)}
                          disabled={isReadOnly}
                        >
                          {t("conclusion")}
                        </Checkbox>
                      </Col>
                    </Row>
                  </Checkbox.Group>
                </Form.Item>
              </Col>
              <Col span={16}>
                <Form.Item
                  name="conclusionRegNum"
                  label={t("conclusion_number")}
                >
                  <Input
                    className="w-100"
                    min={0}
                    maxLength={255}
                    disabled={isReadOnly}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Col>
          <Col xs={24} sm={24} md={24}>
            <Form.Item
              name="regEndDate"
              label={t("reg_end_date")}
              placeholder={t("reg_end_date_placeholder")}
              // rules={rules.error}
              disabled={isReadOnly}
            >
              <DatePicker
                format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT}
                className="w-100"
                onChange={() => {
                  props.form.setFieldsValue({ completeStatus: "COMPLETED" });
                  setCompleteStatusValue("COMPLETED");
                }}
                disabled={isReadOnly}
                onBlur={(e) => {
                  const input = e.target.value;
                  if (/^\d{8}$/.test(input)) {
                    const parsed = dayjs(input, "DDMMYYYY", true);
                    if (parsed.isValid()) {
                      // Use the correct form reference
                      props.form.setFieldsValue({ regEndDate: parsed });
                      // Update the input display to show formatted date
                      e.target.value = parsed.format(DATE_FORMAT_DD_MM_YYYY_WITH_DOT);
                    }
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "Tab") {
                    const input = e.target.value;
                    if (/^\d{8}$/.test(input)) {
                      const parsed = dayjs(input, "DDMMYYYY", true);
                      if (parsed.isValid()) {
                        // Use the correct form reference
                        props.form.setFieldsValue({ regEndDate: parsed });
                        // Update the input display to show formatted date
                        e.target.value = parsed.format(DATE_FORMAT_DD_MM_YYYY_WITH_DOT);
                      }
                    }

                    // if (e.key === "Enter") {
                    //   e.preventDefault();
                    //   const nextInput = document.querySelector("[tabindex=\"15\"]");
                    //   if (nextInput) nextInput.focus();
                    // }
                  }
                }}
                onInputKeyDown={(e) => {
                  const input = e.target;
                  const value = input.value.replace(/\D/g, ''); // Remove non-digits

                  // Auto-format as user types
                  if (e.key !== "Backspace" && e.key !== "Delete" && e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Enter" && e.key !== "Tab") {
                    const digits = value.slice(0, 8);
                    const len = digits.length;
                    const day = digits.slice(0, 2);
                    const month = digits.slice(2, 4);
                    const year = digits.slice(4, 8);

                    let masked = "";
                    if (len <= 2) {
                      masked = day + (len === 2 ? "." : "");
                    } else if (len <= 4) {
                      masked = day + "." + month + (len === 4 ? "." : "");
                    } else {
                      masked = day + "." + month + "." + year;
                    }

                    if (input.value !== masked) {
                      setTimeout(() => {
                        input.value = masked;
                        const pos = masked.length;
                        try {
                          input.setSelectionRange(pos, pos);
                        } catch (_) { }
                      }, 0);
                    }
                  }
                }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={24} md={24}>
            <Form.Item
              name="completeStatus"
              label={t("complete_status")}
              rules={rules.completeStatus}
            >
              <Select
                className="w-100"
                style={{ minWidth: 180 }}
                placeholder={t("select_a_form")}
                onChange={(value) => {
                  setCompleteStatusValue(value);
                  props.form.setFieldsValue({ completeStatus: value });
                }}
                defaultValue={"WAITING"}
                disabled={isReadOnly}
                maxLength={255}
                value={completeStatusValue}
              >
                {CompleteStatus.map((option) => (
                  <Option key={option.value} value={option.value}>
                    {option.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} sm={24} md={24}>
            <Form.Item name="accessStatus" label={t("access_status")}>
              <Select
                className="w-100"
                placeholder={t("access_status")}
                showSearch
                style={{ width: 200, cursor: "pointer" }}
                optionFilterProp="children"
                onChange={(value) => {
                  props.form.setFieldsValue({ accessStatus: value });
                }}
                defaultValue={"ПРОВЕРКА"}
                onSearch={(searchText) => {
                  if (searchText.length === 0) {
                    // Agar qidiruv matni bo'sh bo'lsa, barcha natijalarni qayta yuklash
                    fetchAccessStatus("").then((data) => {
                      setAccessStatusOptions(
                        data.map((item) => ({
                          value: item.name,
                          label: item.name,
                        }))
                      );
                    });
                  } else {
                    debouncedFetchAccessStatus(searchText);
                  }
                }}
                loading={accessStatusFetching}
                filterOption={false}
                options={accessStatusOptions}
                disabled={isReadOnly}
              />
            </Form.Item>
          </Col>
        </Card>
        <Card>
          <Form.Item name="conclusion_compr" label={t("conclusion_compr")} style={{ flex: 1 }}>
            <Input.TextArea
              className="w-100"
              style={{ height: "80px", resize: "none" }} // Ensure it takes full height and disable resizing
              disabled={isReadOnly}
            />
          </Form.Item>
        </Card>
        <Card>
          <Form.Item
            name="additionalNotes"
            label={t("additional_compr_info")}
            style={{ flex: 1 }}
          >
            <Input.TextArea
              className="w-100"
              style={{ height: "80px", resize: "none" }} // Ensure it takes full height and disable resizing
              disabled={isReadOnly}
            />
          </Form.Item>
          <Form.Item name="externalNotes" label={t("moving")}>
            <Input
              className="w-100"
              min={0}
              maxLength={255}
              disabled={isReadOnly}
            />
          </Form.Item>
        </Card>
      </Col>
      {mode !== "EDIT" && modelProps === "registration" ? (
        <Col xs={24} sm={24} md={24} style={{ marginTop: 16 }}>
          <Card
            title={t("add_new_relative")}
            extra={
              <Button
                type="primary"
                onClick={() => {
                  showModal();
                }}
                icon={<PlusOutlined />}
                tabIndex={16}
                disabled={!isReadOnly}
              >
                {t("add_new_relative")}
              </Button>
            }
          >
            <>
              <RelativeTable
                relativeData={dataSource}
                setDataSource={setDataSource}
                setPageNumber={setRelativePageNumber}
                pageNumber={relativePageNumber}
                setPageSize={setRelativePageSize}
                pageSize={relativePageSize}
                setTotal={setRelativeTotal}
                total={relativeTotal}
                model={model}
              />
              <Modal
                title={t("add_new_relative")}
                open={isModalVisible}
                width="50%"
                footer={[
                  <Button
                    key="clear"
                    onClick={() => {
                      handleClearModal();
                    }}
                    tabIndex={32}
                  >
                    {t("clear")}
                  </Button>,
                  <Button
                    key="back"
                    onClick={() => {
                      handleCancel();
                    }}
                    tabIndex={31}
                  >
                    {t("cancel")}
                  </Button>,
                  <Button
                    key="submit"
                    type="primary"
                    onClick={() => {
                      handleAdd();
                    }}
                    tabIndex={30}
                  >
                    {t("save")}
                  </Button>,
                ]}
                onCancel={() => {
                  handleCancel();
                }}
              >
                <Form layout="vertical" form={relativeForm}>
                  <Row gutter={16}>
                    <Col xs={24} sm={12} md={8}>
                      <Form.Item label={t("last_name")} required>
                        <Input
                          ref={firstNameInputRef}
                          value={relativeData.lastName}
                          maxLength={255}
                          autoFocus={true}
                          onChange={(e) =>
                            setRelativeData({
                              ...relativeData,
                              lastName: e.target.value,
                            })
                          }
                          tabIndex={17}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const nextInput =
                                e.target.parentElement.parentElement.parentElement.nextElementSibling?.querySelector(
                                  "input"
                                );
                              if (nextInput) nextInput.focus();
                            }
                          }}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12} md={8}>
                      <Form.Item label={t("first_name")} required>
                        <Input
                          value={relativeData.firstName}
                          maxLength={255}
                          onChange={(e) =>
                            setRelativeData({
                              ...relativeData,
                              firstName: e.target.value,
                            })
                          }
                          tabIndex={18}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const nextInput =
                                e.target.parentElement.parentElement.parentElement.nextElementSibling?.querySelector(
                                  "input"
                                );
                              if (nextInput) nextInput.focus();
                            }
                          }}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12} md={8}>
                      <Form.Item label={t("father_name")} required>
                        <Input
                          value={relativeData.fatherName}
                          maxLength={255}
                          onChange={(e) =>
                            setRelativeData({
                              ...relativeData,
                              fatherName: e.target.value,
                            })
                          }
                          tabIndex={19}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const nextInput =
                                e.target.parentElement.parentElement.parentElement.parentElement.nextElementSibling?.querySelector(
                                  "select"
                                );
                              if (nextInput) nextInput.focus();
                            }
                          }}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16}>
                    <Col xs={24} sm={12} md={12}>
                      <Form.Item label={t("relation_degree")} required>
                        <Select
                          className="w-100"
                          placeholder={t("relation_degree")}
                          showSearch
                          style={{ width: 200, cursor: "pointer" }}
                          optionFilterProp="children"
                          onChange={(value) => {
                            setRelativeData({
                              ...relativeData,
                              relationDegree: value,
                            });
                          }}
                          onSearch={(searchText) => {
                            if (searchText.length === 0) {
                              // Agar qidiruv matni bo'sh bo'lsa, barcha natijalarni qayta yuklash
                              fetchRelationDegree("").then((data) => {
                                setRelationDegreeOptions(
                                  data.map((item) => ({
                                    value: item.name,
                                    label: item.name,
                                  }))
                                );
                              });
                            } else {
                              debouncedFetchRelationDegree(searchText);
                            }
                          }}
                          loading={relationDegreeFetching}
                          filterOption={false}
                          tabIndex={20}
                          value={relativeData.relationDegree}
                          options={relationDegreeOptions}
                          onSelect={() => {
                            setTimeout(() => {
                              const nextInput =
                                document.querySelector("[tabindex=\"21\"]");
                              if (nextInput) nextInput.focus();
                            }, 100);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const nextInput =
                                document.querySelector("[tabindex=\"21\"]");
                              if (nextInput) nextInput.focus();
                            }
                          }}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={8} md={6}>
                      <Form.Item name="formType" label={t("form_type")}>
                        <Select
                          className="w-100"
                          onChange={(value) => {
                            setFormType(value);
                          }}
                          defaultValue={"year"}
                          tabIndex={21}
                          onSelect={() => {
                            setTimeout(() => {
                              const nextInput =
                                document.querySelector("[tabindex=\"22\"]");
                              if (nextInput) nextInput.focus();
                            }, 100);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const nextInput =
                                document.querySelector("[tabindex=\"22\"]");
                              if (nextInput) nextInput.focus();
                            }
                          }}
                        >
                          <Option value="year">{t("year")}</Option>
                          <Option value="month_year">{t("month_year")}</Option>
                        </Select>
                      </Form.Item>
                    </Col>
                    {formType === "year" && (
                      <Col xs={24} sm={24} md={6}>
                        <Form.Item
                          name="birthYear"
                          label={t("birth_date")}
                          required
                        >
                          <InputNumber
                            className="w-100"
                            tabIndex={22}
                            onChange={(value) => {
                              if (value !== undefined) {
                                value = Number(value);
                                setRelativeData({
                                  ...relativeData,
                                  birthYear: value,
                                });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const nextInput =
                                  document.querySelector("[tabindex=\"23\"]");
                                if (nextInput) nextInput.focus();
                              }
                            }}
                          />
                        </Form.Item>
                      </Col>
                    )}
                    {formType === "month_year" && (
                      <Col xs={24} sm={24} md={6}>
                        <Form.Item
                          name="birthDate"
                          label={t("birth_date")}
                          required
                        >
                          <DatePicker
                            format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT}
                            className="w-100"
                            tabIndex={22}
                            // disabled={isReadOnly}
                            onChange={(date) => {
                              relativeForm.setFieldsValue({ birthDate: date });
                              setRelativeData({
                                ...relativeData,
                                birthDate: date,
                              });
                            }}
                            onBlur={(e) => {
                              const input = e.target.value;
                              if (/^\d{8}$/.test(input)) {
                                const parsed = dayjs.utc(input, "DDMMYYYY", true);
                                if (parsed.isValid()) {
                                  relativeForm.setFieldsValue({ birthDate: parsed });
                                  e.target.value = parsed.format(DATE_FORMAT_DD_MM_YYYY_WITH_DOT);
                                  setRelativeData({
                                    ...relativeData,
                                    birthDate: parsed,
                                  });
                                }
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === "Tab") {
                                const input = e.target.value;
                                if (/^\d{8}$/.test(input)) {
                                  const parsed = dayjs.utc(input, "DDMMYYYY", true);
                                  if (parsed.isValid()) {
                                    relativeForm.setFieldsValue({ birthDate: parsed });
                                    e.target.value = parsed.format(DATE_FORMAT_DD_MM_YYYY_WITH_DOT);
                                    setRelativeData({
                                      ...relativeData,
                                      birthDate: parsed,
                                    });
                                  }
                                }

                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const nextInput = document.querySelector("[tabindex=\"23\"]");
                                  if (nextInput) nextInput.focus();
                                }
                              }
                            }}
                            onInputKeyDown={(e) => {
                              const input = e.target;
                              const value = input.value.replace(/\D/g, ''); // Remove non-digits

                              // Auto-format as user types
                              if (e.key !== "Backspace" && e.key !== "Delete" && e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Enter" && e.key !== "Tab") {
                                const digits = value.slice(0, 8);
                                const len = digits.length;
                                const day = digits.slice(0, 2);
                                const month = digits.slice(2, 4);
                                const year = digits.slice(4, 8);

                                let masked = "";
                                if (len <= 2) {
                                  masked = day + (len === 2 ? "." : "");
                                } else if (len <= 4) {
                                  masked = day + "." + month + (len === 4 ? "." : "");
                                } else {
                                  masked = day + "." + month + "." + year;
                                }

                                if (input.value !== masked) {
                                  setTimeout(() => {
                                    input.value = masked;
                                    const pos = masked.length;
                                    try {
                                      input.setSelectionRange(pos, pos);
                                    } catch (_) { }
                                  }, 0);
                                }
                              }
                            }}
                          />
                        </Form.Item>
                      </Col>
                    )}
                  </Row>
                  <Row gutter={16}>
                    <Col xs={24} sm={12} md={12}>
                      <Form.Item label={t("birth_place")} required>
                        <Select
                          className="w-100"
                          placeholder={t("birth_place")}
                          showSearch
                          allowClear
                          style={{ width: 200, cursor: "pointer" }}
                          optionFilterProp="children"
                          value={relativeData.birthPlace}
                          onSearch={(val) => {
                            const typed = (val || "").trim();
                            birthPlaceSearchRef.current = typed;
                            setSearchValue(typed);
                            // Qidiruv natijalarini yangilash uchun dropdown'ni qayta render qilamiz
                            // Bu dropdown'da kiritilgan matn va uning ostida mos keluvchi variantlarni ko'rsatadi
                          }}
                          filterOption={(input, option) => {
                            const inputValue = (input || "").toLowerCase();
                            const optionValue = (option?.label ?? option?.value ?? "").toLowerCase();

                            // Agar bu kiritilgan matn bo'lsa, har doim ko'rsatamiz
                            if (option.className === "custom-typed-option") {
                              return true;
                            }

                            // Boshqa variantlar uchun qidiruv
                            return optionValue.includes(inputValue);
                          }}
                          tabIndex={23}
                          options={birthPlaceOptions}
                          onChange={(value, option) => {
                            // Select item tanlanganda doim tanlangan qiymatni yozamiz
                            const chosen = typeof value === 'string' ? value : '';
                            if (chosen) {
                              setRelativeData({
                                ...relativeData,
                                birthPlace: chosen,
                              });
                              birthPlaceSearchRef.current = chosen;
                              setSearchValue(chosen);
                            }
                          }}
                          onClear={() => {
                            birthPlaceSearchRef.current = "";
                            setSearchValue("");
                            setRelativeData({
                              ...relativeData,
                              birthPlace: "",
                            });
                          }}
                          onSelect={() => {
                            setTimeout(() => {
                              const nextInput = document.querySelector("[tabindex=\"24\"]");
                              if (nextInput) nextInput.focus();
                            }, 100);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const dropdownOpen = !!document.querySelector('.ant-select-dropdown');
                              const activeOption = document.querySelector('.ant-select-item-option-active');

                              if (dropdownOpen && activeOption) {
                                // Dropdown ochiq va aktiv element bo'lsa, uni tanlashga ruxsat beramiz
                                // Antd o'zi tanlangan elementni o'rnatadi va keyingi input'ga o'tadi
                                return;
                              }

                              // Dropdown ochiq emas yoki aktiv element yo'q bo'lsa, kiritilgan matnni saqlaymiz
                              const typed = (e.target?.value ?? birthPlaceSearchRef.current ?? "").trim();
                              if (typed.length > 0) {
                                e.preventDefault();
                                setRelativeData({
                                  ...relativeData,
                                  birthPlace: typed,
                                });
                                birthPlaceSearchRef.current = typed;
                                setSearchValue(typed);
                                const nextInput = document.querySelector("[tabindex=\"24\"]");
                                if (nextInput) nextInput.focus();
                              }
                            }
                          }}
                          // Qo'lda kiritish uchun:
                          onInputKeyDown={(e) => {
                            if (e.key === "Tab" && !e.shiftKey) {
                              const dropdownOpen = !!document.querySelector('.ant-select-dropdown');
                              const activeOption = document.querySelector('.ant-select-item-option-active');

                              if (dropdownOpen && activeOption) {
                                // Dropdown ochiq va aktiv element bo'lsa, uni tanlashga ruxsat beramiz
                                return;
                              }

                              // Dropdown ochiq emas yoki aktiv element yo'q bo'lsa, kiritilgan matnni saqlaymiz
                              const val = e.target?.value;
                              if (val) {
                                e.preventDefault();
                                setRelativeData({
                                  ...relativeData,
                                  birthPlace: val,
                                });
                                birthPlaceSearchRef.current = val;
                                setSearchValue(val);
                                const next = document.querySelector('[tabindex="24"]');
                                setTimeout(() => next?.focus(), 0);
                              }
                            }
                          }}
                          onBlur={() => {
                            const typed = (birthPlaceSearchRef.current ?? "").trim();
                            // Focus yo'qolganida kiritilgan matnni saqlaymiz
                            if (typed.length > 0) {
                              setRelativeData({
                                ...relativeData,
                                birthPlace: typed,
                              });
                              setSearchValue(typed);
                            }
                          }}
                          onDropdownVisibleChange={(open) => {
                            if (!open) {
                              const typed = (birthPlaceSearchRef.current ?? "").trim();
                              // Dropdown yopilganida kiritilgan matnni saqlaymiz
                              if (typed.length > 0) {
                                setRelativeData({
                                  ...relativeData,
                                  birthPlace: typed,
                                });
                                setSearchValue(typed);
                              }
                            }
                          }}
                        >
                        </Select>
                      </Form.Item>

                    </Col>
                    <Col xs={24} sm={12} md={12}>
                      <Form.Item label={t("residence")}>
                        <Input
                          value={relativeData.residence}
                          maxLength={255}
                          onChange={(e) =>
                            setRelativeData({
                              ...relativeData,
                              residence: e.target.value,
                            })
                          }
                          tabIndex={24}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const nextInput =
                                document.querySelector("[tabindex=\"25\"]");
                              if (nextInput) nextInput.focus();
                            }
                          }}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16}>
                    <Col xs={24} sm={12} md={12}>
                      <Form.Item label={t("workplace")}>
                        <AutoComplete
                          className="w-100"
                          style={{ width: 200 }}
                          placeholder={t("workplace")}
                          options={workplaceOptions}
                          maxLength={255}
                          onChange={(value) => {
                            setRelativeData({
                              ...relativeData,
                              workplace: value,
                            });
                          }}
                          onSearch={(searchText) => {
                            if (searchText.length === 0) {
                              // Agar qidiruv matni bo'sh bo'lsa, barcha natijalarni qayta yuklash
                              fetchWorkplaces("").then((data) => {
                                setWorkplaceOptions(
                                  data.map((item) => ({
                                    value: item.name,
                                    label: item.name,
                                  }))
                                );
                              });
                            } else {
                              debouncedFetchWorkplaces(searchText);
                            }
                          }}
                          filterOption={(inputValue, option) =>
                            option.value
                              .toUpperCase()
                              .indexOf(inputValue.toUpperCase()) !== -1
                          }
                          tabIndex={25}
                          value={relativeData.workplace}
                          onSelect={() => {
                            setTimeout(() => {
                              const nextInput =
                                document.querySelector("[tabindex=\"25\"]");
                              if (nextInput) nextInput.focus();
                            }, 100);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const nextInput =
                                document.querySelector("[tabindex=\"25\"]");
                              if (nextInput) nextInput.focus();
                            }
                          }}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12} md={12}>
                      <Form.Item label={t("position")}>
                        <Input
                          maxLength={255}
                          value={relativeData.position}
                          onChange={(e) =>
                            setRelativeData({
                              ...relativeData,
                              position: e.target.value,
                            })
                          }
                          tabIndex={26}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const nextInput =
                                document.querySelector("[tabindex=\"27\"]");
                              if (nextInput) nextInput.focus();
                            }
                          }}
                        />
                      </Form.Item>
                    </Col>

                    <Col xs={24} sm={12} md={12}>
                      <Form.Item name="model" label={t("model")}>
                        <Select
                          className="w-100"
                          style={{ minWidth: 60 }}
                          placeholder={t("select_form")}
                          onChange={(value) => {
                            setRelativeData({
                              ...relativeData,
                              model: value,
                            });
                          }}
                          tabIndex={27}
                          defaultValue={"relative"}
                          value={relativeData.model}
                          onSelect={() => {
                            setTimeout(() => {
                              const nextInput =
                                document.querySelector("[tabindex=\"28\"]");
                              if (nextInput) nextInput.focus();
                            }, 100);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const nextInput =
                                document.querySelector("[tabindex=\"28\"]");
                              if (nextInput) nextInput.focus();
                            }
                          }}
                        >
                          {relativeModelOptions.map((option) => (
                            <Option key={option.value} value={option.value}>
                              {option.label}
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16}>
                    <Col xs={24} sm={12} md={12}>
                      <Form.Item label={t("compr_info")}>
                        <Input.TextArea
                          value={relativeData.notes}
                          onChange={(e) =>
                            setRelativeData({
                              ...relativeData,
                              notes: e.target.value,
                            })
                          }
                          tabIndex={28}
                          style={{
                            height: "200px",
                            overflowY: "auto",
                            width: "100%",
                          }} // Set max height and enable scrolling
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && e.ctrlKey) {
                              e.preventDefault();
                              const nextInput =
                                document.querySelector("[tabindex=\"29\"]");
                              if (nextInput) nextInput.focus();
                            }
                          }}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12} md={12}>
                      <Form.Item label={t("additional_compr_info")}>
                        <Input.TextArea
                          value={relativeData.additionalNotes}
                          onChange={(e) =>
                            setRelativeData({
                              ...relativeData,
                              additionalNotes: e.target.value,
                            })
                          }
                          tabIndex={29}
                          style={{
                            height: "200px",
                            overflowY: "auto",
                            width: "100%",
                          }} // Set max height and enable scrolling
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && e.ctrlKey) {
                              e.preventDefault();
                              const saveButton =
                                document.querySelector("[tabindex=\"30\"]");
                              if (saveButton) saveButton.focus();
                            }
                          }}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </Form>
              </Modal>
            </>
          </Card>
        </Col>
      ) : (
        <></>
      )}
    </Row>
  );
};

export default GeneralField;
