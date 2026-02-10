import React, { useEffect, useState } from "react";
import {
  Input,
  Row,
  Col,
  Card,
  Form,
  InputNumber,
  Select,
  DatePicker,
  AutoComplete,
} from "antd";
import { debounce } from "lodash";
import { DATE_FORMAT_DD_MM_YYYY_WITH_DOT } from "constants/DateConstant";
import RelationService from "services/RelationlaceService";
import WorkPlaceService from "services/WorkPlaceService";
import InitiatorService from "services/InitiatorService";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";

const { Option } = Select;

const fetchRelationDegree = async (searchText) => {
  try {
    const response = await RelationService.getRelationList(1, 5, searchText);
    return response?.data?.relationDegrees;
  } catch (error) {
    console.error("Xatolik:", error);
    return [];
  }
};

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

const fetchInitiators = async (searchText) => {
  try {
    const response = await InitiatorService.getList(1, 5, searchText);
    return response?.data?.data?.map((item) => ({
      full_name: item?.first_name + " " + item?.last_name,
      id: item?.id,
    }));
  } catch (error) {
    console.error("Xatolik:", error);
    return [];
  }
};

const GeneralField = (props) => {
  const { t } = useTranslation();
  const [workplaceOptions, setWorkplaceOptions] = useState([]);
  const [initiatorOptions, setInitiatorOptions] = useState([]);
  const [initiatorFetching, setInitiatorFetching] = useState(false);
  const [relationDegreeOptions, setRelationDegreeOptions] = useState([]);
  const [relationDegreeFetching, setRelationDegreeFetching] = useState(false);
  const [formType, setFormType] = useState(
    props.form?.getFieldValue("formType") || "month_year"
  );
  const [dateInput, setDateInput] = useState(null);
  const relationDegreeRef = React.useRef();
  const [isReadOnly, setIsReadOnly] = useState(false);

  useEffect(() => {
    if (relationDegreeRef.current) {
      relationDegreeRef.current.focus();
    }
  }, []);

  const handleFormTypeChange = (value) => {
    setFormType(value);
    if (value === "year") {
      setDateInput(null);
    } else if (value === "month_year") {
    }
  };
  const [relativeData] = useState({
    model: "relative",
    id: "",
    firstName: "",
    lastName: "",
    fatherName: "",
    relationDegree: "",
    birthDate: null,
    birthYear: null,
    birthPlace: "",
    residence: "",
    workplace: "",
    position: "",
    notes: "",
    additionalNotes: "",
    accessStatus: "",
    createdAt: "",
    updatedAt: "",
  });

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
    if (searchText.length >= 1) {
      setInitiatorFetching(true);
      const initiators = await fetchInitiators(searchText);
      setInitiatorOptions(
        initiators.map((item) => ({
          value: item?.id,
          label: item?.full_name,
          id: item?.id,
        }))
      );
      setInitiatorFetching(false);
    }
  }, 500);

  const debouncedFetchWorkplaces = debounce(async (searchText) => {
    if (searchText.length > 2) {
      const data = await fetchWorkplaces(searchText);
      setWorkplaceOptions(
        data.map((item) => ({
          value: item.name,
          label: item.name,
        }))
      );
    }
  }, 500);

  useEffect(() => {
    const fetchData = async () => {
      const initiators = await fetchInitiators("");
      const relationDegrees = await fetchRelationDegree("");
      const workplaces = await fetchWorkplaces("");
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
  }, []);

  const relativeModelOptions = [
    { value: "relative", label: t("relative") },
    { value: "relativeWithoutAnalysis", label: t("relativeWithoutAnalysis") },
  ];

  const rules = {
    errorMsg: [
      {
        required: true,
        message: t("required_field"),
      },
    ],
  };
  return (
    <Row gutter={16}>
      <Col xs={24} sm={24} md={17}>
        <Card>
          <Row gutter={16}>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="relationshipName" label={t("relationship")}>
                <Input className="w-100" autoFocus readOnly={true} />
              </Form.Item>
              <Form.Item name="relationship" hidden label={t("relationship")}>
                <Input className="w-100" autoFocus readOnly={true} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item
                name="relationDegree"
                label={t("relation_degree")}
                rules={rules.errorMsg}
              >
                <Select
                  ref={relationDegreeRef}
                  className="w-100"
                  showSearch
                  tabIndex={1}
                  style={{ width: 200, cursor: "pointer" }}
                  optionFilterProp="children"
                  onChange={(value) => {
                    props.form.setFieldsValue({
                      relationDegree: value,
                    });
                  }}
                  onSearch={(searchText) => {
                    if (searchText.length === 0) {
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
                  options={relationDegreeOptions}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const nextInput = document.querySelector("[tabindex=\"2\"]");
                      if (nextInput) nextInput.focus();
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={8}>
              <Form.Item
                name="lastName"
                label={t("last_name")}
                rules={rules.errorMsg}
              >
                <Input className="w-100" tabIndex={2}
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
            <Col xs={24} sm={24} md={8}>
              <Form.Item
                name="firstName"
                label={t("first_name")}
                rules={rules.errorMsg}
              >
                <Input className="w-100" tabIndex={3} onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const nextInput = document.querySelector("[tabindex=\"4\"]");
                    if (nextInput) nextInput.focus();
                  }
                }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={8}>
              <Form.Item
                name="fatherName"
                label={t("father_name")}
                rules={rules.errorMsg}
              >
                <Input className="w-100" tabIndex={4} onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const nextInput = document.querySelector("[tabindex=\"5\"]");
                    if (nextInput) nextInput.focus();
                  }
                }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="nationality" label={t("nationality")}>
                <Input className="w-100" tabIndex={5} onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const nextInput = document.querySelector("[tabindex=\"6\"]");
                    if (nextInput) nextInput.focus();
                  }
                }} />
              </Form.Item>
            </Col>
            <Form.Item
              name="or_tab"
              label={t("initiator")}
              rules={rules.errorMsg}
              hidden
            >
              <Select
                showSearch
                className="w-100"
                style={{ width: 200, cursor: "pointer" }}
                optionFilterProp="children"
                onChange={(value, option) => {
                  props.form.setFieldsValue({
                    or_tab: value,
                  });
                }}
                onSearch={debouncedFetchInitiators}
                loading={initiatorFetching}
                filterOption={false}
                options={initiatorOptions}

              />
            </Form.Item>
            {/* Teet */}
            <Col xs={24} sm={8} md={4}>
              <Form.Item name="formType" label=" ">
                <Select
                  className="w-100"
                  onChange={handleFormTypeChange}
                  defaultValue={"month_year"}
                  tabIndex={6}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const nextInput = document.querySelector("[tabindex=\"7\"]");
                      if (nextInput) nextInput.focus();
                    }
                  }}
                >
                  <Option value="year">{t("year")}</Option>
                  <Option value="month_year">{t("month_year")}</Option>
                </Select>
              </Form.Item>
            </Col>
            {formType === "month_year" ? (
              <Col xs={24} sm={24} md={8}>
                <Form.Item name="birthDate" label={t("birth_date")} required>
                  <DatePicker
                    format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT}
                    className="w-100"
                    tabIndex={7}
                    onChange={(date) => setDateInput(date)}
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
                          const nextInput = document.querySelector("[tabindex=\"9\"]");
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
            ) : (
              <Col xs={24} sm={24} md={8}>
                <Form.Item name="birthYear" label={t("birth_date")} required>
                  <InputNumber
                    className="w-100"
                    tabIndex={7}
                    onChange={(value) => {
                      if (value !== undefined) {
                        value = Number(value);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const nextInput = document.querySelector("[tabindex=\"9\"]");
                        if (nextInput) nextInput.focus();
                      }
                    }}
                  />
                </Form.Item>
              </Col>
            )}
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="birthPlace" label={t("birth_place")} required>
                <Input
                  value={relativeData.birthPlace}
                  onChange={(e) =>
                    props.form.setFieldsValue({
                      birthPlace: e.target.value,
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const nextInput = document.querySelector("[tabindex=\"9\"]");
                      if (nextInput) nextInput.focus();
                    }
                  }}
                  tabIndex={9}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item
                name="residence"
                label={t("residence")}
                rules={rules.errorMsg}
              >
                <Input className="w-100" tabIndex={9} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item
                name="workplace"
                label={t("workplace")}
                rules={rules.errorMsg}
              >
                <AutoComplete
                  className="w-100"
                  style={{ width: 200 }}
                  placeholder={t("workplace")}
                  options={workplaceOptions}
                  onChange={(value) => {
                    props.form.setFieldsValue({
                      workplace: value,
                    });
                  }}
                  onSearch={(searchText) => {
                    if (searchText.length === 0) {
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const nextInput = document.querySelector("[tabindex=\"10\"]");
                      if (nextInput) nextInput.focus();
                    }
                  }}
                  tabIndex={9}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="position" label={t("position")}>
                <Input className="w-100" tabIndex={10} onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const nextInput = document.querySelector("[tabindex=\"11\"]");
                    if (nextInput) nextInput.focus();
                  }
                }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={12}>
              <Form.Item name="model" label={t("model")}>
                <Select
                  className="w-100"
                  style={{ minWidth: 60 }}
                  placeholder={t("select_form")}
                  tabIndex={11}
                  defaultValue={relativeData.model}
                  onChange={(value) => {
                    props.form.setFieldsValue({
                      model: value,
                    });
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
            <Col xs={24} sm={24} md={24}>
              <Row gutter={16}>
                <Col xs={12}>
                  <Form.Item name="notes" label={t("compr_info")}>
                    <Input.TextArea
                      style={{
                        height: "200px",
                        overflowY: "auto",
                        width: "100%",
                      }}
                      tabIndex={13}
                    />
                  </Form.Item>
                </Col>
                <Col xs={12}>
                  <Form.Item
                    name="additionalNotes"
                    label={t("comment")}
                  >
                    <Input.TextArea
                      style={{
                        height: "200px",
                        overflowY: "auto",
                        width: "100%",
                      }}
                      tabIndex={14}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Col>
          </Row>
        </Card>
      </Col>
    </Row>
  );
};

export default GeneralField;
