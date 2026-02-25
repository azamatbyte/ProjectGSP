import React, { useState, useEffect, useCallback } from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button, message, Modal, DatePicker, Select } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
// StatusField currently unused; keep file if needed in future
// import StatusField from "./StatusField";
import RegistrationService from "services/RegistrationService";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { CompleteStatus } from "constants/CompleteStatus";
import { LeftCircleOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { MODEL_TYPES } from "utils/sessions";
import { DATE_FORMAT_DD_MM_YYYY_WITH_DOT } from "constants/DateConstant";
import debounce from "lodash/debounce";
import AccessStatusService from "services/AccessStatusService";
// set, values imported previously but unused
// import { set, values } from "lodash";
const ADD = "ADD";
const EDIT = "EDIT";

const fromatInitiator = (initiator) => {
  if (!initiator) {
    return "Initiator not found";
  }
  return initiator?.first_name + " " + initiator?.last_name;
};

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

const RegisterForm = (props) => {
  const { t } = useTranslation();
  const { mode = ADD, param, model: modelProps } = props;
  const [form] = Form.useForm();
  const [statusForm] = Form.useForm();
  const [id, setId] = useState({ id: param?.id, initiatorId: "" });
  const [isDone, setIsDone] = useState(false);
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const navigate = useNavigate();
  const [model, setModel] = useState("");
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [accessStatusOptions, setAccessStatusOptions] = useState([]);
  const [accessStatusFetching, setAccessStatusFetching] = useState(false);

  const registerInformation = useCallback(
    async (id) => {
      try {
        const response = await RegistrationService.getById(param?.id);
        const {
          firstName: first_name,
          lastName: last_name,
          fatherName: father_name,
          birthDate,
          form_reg,
          recordNumber,
          birthPlace,
          executor,
          Initiator,
          workplace,
          nationality,
          position,
          regNumber,
          residence,
          regDate,
          regEndDate,
          conclusionRegNum,
          completeStatus,
          accessStatus, 
          model,
          notes,
          externalNotes,
          additionalNotes,
          pinfl,
          passport,
          conclusion_compr
        } = response?.data?.data;
        if (model === "registration4") {
          form.setFieldsValue({
            birthYear: response?.data?.data?.birthYear,
          });
        }
        setModel(model);
        form.setFieldsValue({
          first_name,
          last_name,
          form_reg,
          father_name,
          recordNumber,
          birthDate: birthDate ? dayjs(birthDate) : null,
          birthPlace,
          executorFirstName: executor?.first_name,
          or_tab: fromatInitiator(Initiator),
          workplace,
          position,
          nationality,
          regNumber,
          residence,
          regDate: regDate ? dayjs(regDate) : null,
          regEndDate: regEndDate ? dayjs(regEndDate) : null,
          conclusionRegNum,
          completeStatus: CompleteStatus.find(
            (item) => item?.value === completeStatus
          )?.label,
          accessStatus,
          notes,
          externalNotes,
          additionalNotes,
          pinfl,
          passport,
          model1: model,
          conclusion_compr,
        });
      } catch (error) {
        console.error("Xatolik:", error);
        message.error(t("data_not_found"));
      }
    },
    [form, param?.id, t]
  );

  useEffect(() => {
    if (mode === EDIT) {
      registerInformation(id);
    }
  }, [mode, id, registerInformation]);

  const backHandle = useCallback(() => {
    Modal.confirm({
      title: t("warning"),
      content: t("exit_confirmation"),
      okText: t("yes"),
      cancelText: t("no"),
      onOk: () => {
        navigate(-1);
      },
    });
  }, [navigate, t]);

  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        backHandle();
      }
    };

    document.addEventListener("keydown", handleEscKey);

    return () => {
      document.removeEventListener("keydown", handleEscKey);
    };
  }, [backHandle]);

  const addRelative = (data) => {
    navigate(`/app/apps/relative/add-relative/${data}`);
  };

  const onFinish = async (values) => {
    try {
      const normalizeDateToUtcMidnight = (value) => {
        return value ? `${dayjs(value).format("YYYY-MM-DD")}T00:00:00.000Z` : null;
      };

      if (values?.birthDate) {
        values.birthDate = normalizeDateToUtcMidnight(values.birthDate);
      }
      if (values?.regDate) {
        values.regDate = normalizeDateToUtcMidnight(values.regDate);
      }
      if (values?.regEndDate) {
        values.regEndDate = normalizeDateToUtcMidnight(values.regEndDate);
      }
      if (mode === "ADD") {
        try {
          if (!values?.completeStatus) {
            values.completeStatus = "WAITING";
          }
          if (!values?.accessStatus) {
            values.accessStatus = "ПРОВЕРКА";
          }
          // values.model = "registration";
          const res = await RegistrationService.create(values);
          if (res.status === 201) {
            message.success(t("register_successfully_added"));
            setId({
              id: res?.data?.data?.id,
              initiatorId: res?.data?.data?.or_tab,
            });
            setIsDone(true);
          }
        } catch (error) {
          if (error.response.data.message === "Full name already exists") {
            message.error(t("full_name_already_exist"));
          } else {
            message.error(t("unknown_error"));
          }
        }
      } else if (mode === "EDIT") {
        try {
          if (isEdit) {
            values.is_edit = isEdit;
          }
          // if (!values?.model1 || values?.model1 !== "registration4") {
          //   values.model = "registration";
          // } else {
          //   values.model = "registration4";
          // }
          if (!values?.completeStatus) {
            values.completeStatus = "WAITING";
          }
          if (
            CompleteStatus.find(
              (item) => item?.label === values?.completeStatus
            )
          ) {
            values.completeStatus = CompleteStatus.find(
              (item) => item?.label === values?.completeStatus
            )?.value;
          }
          if (!values?.accessStatus) {
            values.accessStatus = "ПРОВЕРКА";
          }
          const res = await RegistrationService.update(param?.id, values);
          if (res.status === 200) {
            message.success(t("register_successfully_updated"));
          }
        } catch (error) {
          message.error(t("register_not_updated"));
        }
      }
    } catch (errorInfo) {
      message.error(t("please_enter_all_required_fields"));
    }
  };

  const viewDetails = (id) => {
    navigate(`/app/apps/register/info-register/${id}`);
  };
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

  useEffect(() => {
    setIsReadOnly(props.isReadOnly);
  }, [props.isReadOnly]);

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
      const normalizeDateToUtcMidnight = (value) => {
        return value ? `${dayjs(value).format("YYYY-MM-DD")}T00:00:00.000Z` : null;
      };
      // Map UI field names to API payload keys
      const payload = {
        id: param?.id,
        regEndDate: normalizeDateToUtcMidnight(values.regEndDateStatus) || null,
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
        onFinish={onFinish}
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
                {mode === "ADD"
                  ? t("add_new_register") +
                  (modelProps === "registration4"
                    ? ` ${t("")}`
                    : ` ${t("")}`)
                  : t("") +
                  (modelProps === "registration4"
                    ? ` ${t("edit_form_4")}`
                    : ` ${t("edit_form_anketa")}`)}
              </h2>
              <div className="mb-3">
                {/* {(mode === "EDIT" && modelProps === MODEL_TYPES.REGISTRATION4) && (
                  <Button type="primary" className="mr-2" onClick={() => setStatusModalVisible(true)}>
                    <CheckCircleOutlined />
                    {t("status")}
                  </Button>
                )} */}
                {mode === "EDIT" && (
                  <Button type="primary" className="mr-2" onClick={() => viewDetails(id?.id)}>
                    <CheckCircleOutlined />
                    {t("view_details")}
                  </Button>
                )}
                {mode === "EDIT" && modelProps === MODEL_TYPES.REGISTRATION && (
                  <Button type="primary" onClick={() => addRelative(id?.id)}>
                    <CheckCircleOutlined />
                    {t("add_new_relative")}
                  </Button>
                )}
                {isDone && (
                  <Button type="primary" className="mr-2" onClick={() => viewDetails(id?.id)}>
                    <CheckCircleOutlined />
                    {t("view_details")}
                  </Button>
                )}
                <Button className="ml-2" onClick={backHandle}>
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
                label: t("general"),
                key: "1",
                children: (
                  <GeneralField
                    form={form}
                    id={id?.id}
                    initiatorId={id?.initiatorId}
                    isReadOnly={isDone}
                    mode={mode}
                    model={model}
                    modelProps={modelProps}
                    setIsEdit={setIsEdit}
                  />
                ),
              },
              // {
              //   label: "Status",
              //   key: "2",
              //   children: <StatusField />,
              // },
            ]}
          />
        </div>
      </Form>
      {modelProps === MODEL_TYPES.REGISTRATION4 && (
        <Modal
          title={t("status")}
          open={statusModalVisible}
          onCancel={() => setStatusModalVisible(false)}
          onOk={() => handleStatusModal()}
        >
          <Form form={statusForm} layout="vertical">
            <Form.Item
              name="regEndDateStatus"
              label={t("reg_end_date")}
              placeholder={t("reg_end_date_placeholder")}
              disabled={isReadOnly}
              rules={rulesStatus.regEndDate}
            >
              <DatePicker
                format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT}
                className="w-100"
                onChange={(value) => {
                  // keep value in regEndDateStatus; API mapping happens in handleStatusModal
                  statusForm.setFieldsValue({ regEndDateStatus: value });
                }}
                tabIndex={4}
                disabled={isReadOnly}
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
                placeholder={t("select_a_form")}
                onChange={(value) => {
                  statusForm.setFieldsValue({ completeStatusStatus: value });
                }}
                tabIndex={1}
                disabled={isReadOnly}
                maxLength={255}
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
                tabIndex={15}
                options={accessStatusOptions}
                disabled={isReadOnly}
              />
            </Form.Item>
          </Form>
        </Modal>)}
    </>
  );
};

export default RegisterForm;
