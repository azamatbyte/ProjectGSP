import React, { useState, useEffect, useCallback } from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button, message, Modal, DatePicker, Select } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
import LogListField from "./LogListField";
import RaportSP from "./RaportSP";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import RegistrationService from "services/RegistrationService";
import { CompleteStatus } from "constants/CompleteStatus";
import { LeftCircleOutlined, EditOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { MODEL_TYPES, SESSION_TYPES } from "utils/sessions";
import RelativeService from "services/RelativeService";
import { DATE_FORMAT_DD_MM_YYYY_WITH_DOT } from "constants/DateConstant";
import debounce from "lodash/debounce";
import AccessStatusService from "services/AccessStatusService";
const ADD = "ADD";
const INFO = "INFO";


const { Option } = Select;

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

const formatExecutorFullName = (executor) => {
  if (!executor) return "";
  return [executor?.last_name, executor?.first_name, executor?.father_name]
    .filter((part) => !!String(part || "").trim())
    .join(" ")
    .trim();
};


const RegisterForm = (props) => {
  const { mode = ADD, param } = props;
  const { t } = useTranslation();
  const [statusForm] = Form.useForm();
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [formType, setFormType] = useState("");
  const [regNumber, setRegNumber] = useState("");
  const [model, setModel] = useState("registration");
  const [registerData, setRegisterData] = useState(null);
  const navigate = useNavigate();
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [accessStatusOptions, setAccessStatusOptions] = useState([]);
  const [accessStatusFetching, setAccessStatusFetching] = useState(false);
  const [executorFullName, setExecutorFullName] = useState("");
  useEffect(() => {
    if (mode === INFO) {
      const fetchAdminData = async (id) => {
        try {
          setLoading(true);
          const response = await RegistrationService.getById(id);
          if (response.status !== 200) throw new Error("Failed to fetch data");
          const data = response?.data?.data;
          setRegisterData(data);
          setFormType(data?.form_reg);
          setRegNumber(data?.regNumber);
          setModel(data?.model);
          setExecutorFullName(formatExecutorFullName(data?.executor));
          form.setFieldsValue({
            form_reg: data?.form_reg,
            formtype: data?.form_reg_log,
            regNumber: data?.regNumber,
            regDate: data?.regDate ? dayjs(data?.regDate) : null,
            regEndDate: data?.regEndDate ? dayjs(data?.regEndDate) : null,
            or_tab:
              (data?.Initiator?.first_name ? data?.Initiator?.first_name : "") +
              " " +
              (data?.Initiator?.last_name ? data?.Initiator?.last_name : ""),
            firstName: data?.firstName,
            lastName: data?.lastName,
            fatherName: data?.fatherName,
            birthDate: data?.birthDate ? dayjs(data?.birthDate) : null,
            birthYear: data?.birthYear ? data?.birthYear : null,
            conclusionDate: data?.conclusionDate
              ? dayjs(data?.conclusionDate)
              : null,
            birthPlace: data?.birthPlace,
            residence: data?.residence,
            conclusionRegNum: data?.conclusionRegNum,
            nationality: data?.nationality,
            notes: data?.notes,
            additionalNotes: data?.additionalNotes,
            workplace: data?.workplace,
            position: data?.position,
            accessStatus: data?.accessStatus,
            externalNotes: data?.externalNotes,
            completeStatus: CompleteStatus.find(
              (item) => item?.value === data?.completeStatus
            )?.label,
            recordNumber: data?.recordNumber,
            pinfl: data?.pinfl,
            passport: data?.passport,
            conclusion_compr: data?.conclusion_compr,
          });
        } catch (error) {
          message.error(t("failed_to_load_admin_data"));
          console.error("Error fetching data:", error);
        } finally {
          setLoading(false);
        }
      };

      if (param?.id) {
        fetchAdminData(param?.id);
      }
    }
  }, [param?.id, form, mode, t]);

  useEffect(() => {
    const fetchData = async () => {
      const accessStatuses = await fetchAccessStatus("");
      setAccessStatusOptions(
        accessStatuses.map((item) => ({
          value: item?.name,
          label: item?.name,
        }))
      );
    };
    fetchData();
  }, [model]);

  const backHandle = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const createSessionFunction = async (id, type) => {
    try {
      const response = await RelativeService.addRelativesBySession({
        id: id,
        type: type,
        model: MODEL_TYPES.RELATIVE,
      });
      if (response.status !== 200) throw new Error("Failed to create session");
      message.success(t("session_created"));
    } catch (error) {
      message.error(t("failed_to_create_session"));
    }
  };

  const editHandle = () => {
    navigate(
      "/app/apps/register/edit-register/" + param?.id + "?model=" + model
    );
  };

  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === "Escape") {
        backHandle();
      }
    };

    document.addEventListener("keydown", handleEscKey);

    return () => {
      document.removeEventListener("keydown", handleEscKey);
    };
  }, [backHandle]);

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

  const rulesStatus = {
    regEndDate: [
      {
        required: true,
        message: t("please_enter_the_registration_number"),
      }
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

  const handleStatusModal = async () => {
    try {
      // validate fields in the status modal form and get values
      const values = await statusForm.validateFields();
      // Map UI field names to API payload keys
      const payload = {
        id: param?.id,
        regEndDate: values.regEndDateStatus || null,
        completeStatus: values.completeStatusStatus || null,
        accessStatus: values.accessStatusStatus || null,
      };
      await RegistrationService.updateStatusAll(payload);
      // close modal and give user feedback
      setStatusModalVisible(false);
      statusForm.resetFields();
      message.success(t("success"));
    } catch (err) {
      // validation failed; AntD provides error info
      console.log("Status modal validation failed:", err);
      message.error(t("please_enter_all_required_fields"));
    }
  };


  return (
    <>
      <Form
        layout="vertical"
        form={form}
        name="advanced_search"
        className="ant-advanced-search-form"
      >
        <PageHeaderAlt className="border-bottom" overlap>
          <div className="container">
            <Flex
              className="py-2"
              mobileFlex={false}
              justifyContent="space-between"
              alignItems="center"
            >
              <h2 className="mb-3">
                {" "}
                {model === "registration"
                  ? t("info_register")
                  : t("info_register_four")}{" "}
              </h2>
              
              <div className="mb-3">
                {model === MODEL_TYPES.REGISTRATION4 && (
                  <Button type="primary" className="mr-2" onClick={() => setStatusModalVisible(true)}>
                    <CheckCircleOutlined />
                    {t("status")}
                  </Button>
                )}
                {mode === "INFO" && (
                  <>
                    <Button
                      type="primary"
                      className="mr-2"
                      onClick={() => {
                        createSessionFunction(param?.id, SESSION_TYPES.RAPORT);
                      }}
                    >
                      {t("conclusion")}
                    </Button>
                    <Button
                      type="primary"
                      className="mr-2"
                      onClick={() =>
                        createSessionFunction(param?.id, SESSION_TYPES.SESSION)
                      }
                    >
                      {t("main")}
                    </Button>
                    <Button
                      type="primary"
                      className="mr-2"
                      onClick={() =>
                        createSessionFunction(param?.id, SESSION_TYPES.RESERVE)
                      }
                    >
                      {t("reserve")}
                    </Button>
                    <Button
                      type="primary"
                      className="mr-2"
                      onClick={editHandle}
                    >
                      <EditOutlined />
                      {t("edit")}
                    </Button>
                  </>
                )}
                <Button className="mr-2" onClick={() => backHandle()}>
                  <LeftCircleOutlined /> {t("back")}
                </Button>
              </div>
            </Flex>
          </div>
        </PageHeaderAlt>
        <div className="container">
          <Tabs
            defaultActiveKey="1"
            style={{ marginTop: 30 }}
            items={[
              {
                label: t("anketa"),
                key: "1",
                children: (
                  <GeneralField
                    mode={mode}
                    id={param?.id}
                    loading={loading}
                    formType={formType}
                    regNumber={regNumber}
                    model={model}
                    executorFullName={executorFullName}
                  />
                ),
              },
              {
                label: t("request"),
                key: "3",
                children: (
                  <RaportSP
                    id={param?.id}
                    model={model}
                    regNumber={regNumber}
                    avr={{
                      residence: registerData?.residence,
                      nationality: registerData?.nationality,
                    }}
                  />
                ),
              },
              {
                label: t("log_reg"),
                key: "2",
                children: <LogListField id={param?.id} />,
              },
            ].filter(Boolean)}
          />

        </div>
      </Form>
      {mode === "INFO" && model === MODEL_TYPES.REGISTRATION4 && (
        <Modal
          title={t("status")}
          open={statusModalVisible}
          onCancel={() => setStatusModalVisible(false)}
          onOk={() => handleStatusModal()}
          okButtonProps={{ tabIndex: 4 }}
          cancelButtonProps={{ tabIndex: 5 }}
        >
          <Form form={statusForm} layout="vertical">
            <Form.Item
              name="regEndDateStatus"
              label={t("reg_end_date")}
              placeholder={t("reg_end_date_placeholder")}
              disabled={isReadOnly}
              rules={rulesStatus.regEndDate}
              autoFocus
            >
              <DatePicker
                format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT}
                className="w-100"
                onChange={(value) => {
                  // keep value in regEndDateStatus; API mapping happens in handleStatusModal
                  statusForm.setFieldsValue({ regEndDateStatus: value });
                }}
                tabIndex={1}
                disabled={isReadOnly}
                autoFocus
                onBlur={(e) => {
                  const input = e.target.value;
                  if (/^\d{8}$/.test(input)) {
                    const parsed = dayjs(input, "DDMMYYYY", true);
                    if (parsed.isValid()) {
                      // Use the correct form reference
                      statusForm.setFieldsValue({ regEndDateStatus: parsed });
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
                        statusForm.setFieldsValue({ regEndDateStatus: parsed });
                        // Update the input display to show formatted date
                        e.target.value = parsed.format(DATE_FORMAT_DD_MM_YYYY_WITH_DOT);
                      }
                    }
                    
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const nextInput = document.querySelector("[tabindex=\"2\"]");
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
                        } catch (_) {}
                      }, 0);
                    }
                  }
                }}
              />
            </Form.Item>
            <Form.Item
              name="completeStatusStatus"
              label={t("complete_status")}
              rules={[{ required: true, message: t("required_field") }]}
            >
              <Select
                className="w-100"
                style={{ minWidth: 180 }}
                placeholder={t("select_a_status")}
                onChange={(value) => {
                  statusForm.setFieldsValue({ completeStatusStatus: value });
                }}
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
              >
                {CompleteStatus.map((option) => (
                  <Option key={option.value} value={option.value}>
                    {option.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="accessStatusStatus" label={t("access_status")} rules={[{ required: true, message: t("required_field") }]}>
              <Select
                className="w-100"
                placeholder={t("access_status")}
                showSearch
                style={{ width: 200, cursor: "pointer" }}
                optionFilterProp="children"
                onChange={(value) => {
                  statusForm.setFieldsValue({ accessStatusStatus: value });
                }}
                onSearch={(searchText) => {
                  if (searchText.length === 0) {
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
                tabIndex={3}
                options={accessStatusOptions}
                disabled={isReadOnly}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    // Focus on OK button or handle form submission
                    const okButton = document.querySelector('.ant-modal-footer .ant-btn-primary');
                    if (okButton) okButton.focus();
                  }
                }}
              />
            </Form.Item>
          </Form>
        </Modal>)}
    </>
  );
};

export default RegisterForm;
