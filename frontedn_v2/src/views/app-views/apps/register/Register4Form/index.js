import React, { useState, useEffect, useCallback } from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button, message } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
import RegistrationService from "services/RegistrationService";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { LeftCircleOutlined, CheckCircleOutlined } from "@ant-design/icons";
import {
  useFormDirtyState,
  useGuardedNavigate,
  useUnsavedChangesGuard,
} from "utils/hooks/useUnsavedChangesGuard";
const ADD = "ADD";
const EDIT = "EDIT";

const fromatInitiator = (initiator) => {
  if (!initiator) {
    return "Initiator not found";
  }
  return initiator?.first_name + " " + initiator?.last_name;
};

const RegisterForm = (props) => {
  const { t } = useTranslation();
  const { mode = ADD, param, model: modelProps } = props;
  const [form] = Form.useForm();
  const [id, setId] = useState({ id: param?.id, initiatorId: "" });
  const [isEdit, setIsEdit] = useState(false);
  const guardedNavigate = useGuardedNavigate();
  const [model, setModel] = useState("");
  const [regNumber, setRegNumber] = useState("");

  const [updateCompany, setUpdateCompany] = useState(0);
  const { captureBaseline, isDirty } = useFormDirtyState(form);

  useUnsavedChangesGuard({
    when: isDirty,
    title: t("warning"),
    content: t("exit_confirmation"),
    okText: t("yes"),
    cancelText: t("no"),
  });

  const registerInformation = useCallback(async (id) => {
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
        additionalNotes,
      } = response?.data?.data;
      if (model === "registration4") {
        form.setFieldsValue({
          birthYear: response?.data?.data?.birthYear,
        });
      }
      setModel(model);
      const initialValues = {
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
        completeStatus,
        accessStatus,
        notes,
        additionalNotes,
        model,
      };
      form.setFieldsValue(initialValues);
      captureBaseline({
        ...initialValues,
        ...(model === "registration4"
          ? { birthYear: response?.data?.data?.birthYear }
          : {}),
      });
    } catch (error) {
      console.error("Xatolik:", error);
      captureBaseline(form.getFieldsValue(true));
      message.error(t("data_not_found"));
    }
  }, [captureBaseline, form, param?.id, t]);

  useEffect(() => {
    if (mode === EDIT) {
      registerInformation(id);
    }
  }, [mode, id, registerInformation]);

  const backHandle = useCallback(() => {
    guardedNavigate(-1);
  }, [guardedNavigate]);

  useEffect(() => {
    if (mode !== ADD) {
      return undefined;
    }

    const timer = setTimeout(() => {
      captureBaseline(form.getFieldsValue(true));
    }, 0);

    return () => {
      clearTimeout(timer);
    };
  }, [captureBaseline, form, mode]);

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
    guardedNavigate(
      `/app/apps/relative/add-relative/${data}`
    );
  };

  const onFinish = async (values) => {
    try {
      if (mode === "ADD") {
        try {
          if (!values?.completeStatus) {
            values.completeStatus = "WAITING";
          }
          if (!values?.accessStatus) {
            values.accessStatus = "ПРОВЕРКА";
          }
          values.model = "registration4";
          const res = await RegistrationService.create(values);
          setRegNumber(values?.regNumber);
          setUpdateCompany(updateCompany + 1);
          if (res.status === 201) {
            message.success(t("register_successfully_added"));
            setId({
              id: res?.data?.data?.id,
              initiatorId: res?.data?.data?.or_tab,
            });
            captureBaseline();
          }
        } catch (error) {
          console.log("error", error);
        }
      } else {
        try {
          if (isEdit) {
            values.is_edit = isEdit;
          }
          if (!values?.completeStatus) {
            values.completeStatus = "WAITING";
          }
          if (!values?.accessStatus) {
            values.accessStatus = "ПРОВЕРКА";
          }

          values.model = "registration4";
          setRegNumber(values?.regNumber);
          const res = await RegistrationService.update(param?.id, values);
          if (res.status === 200) {
            message.success(t("register_successfully_updated"));
            captureBaseline();
          }
        } catch (error) {
          console.log("error", error);
        }
      }
    } catch (errorInfo) {
      console.log("Validation failed:", errorInfo);
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
        initialValues={{
          heightUnit: "cm",
          widthUnit: "cm",
          weightUnit: "kg",
        }}
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
                      ? ` ${t("registration4")}`
                      : ` ${t("option_1")}`)
                  : t("edit_register") +
                    (modelProps === "registration4"
                      ? ` ${t("registration4")}`
                      : ` ${t("option_1")}`)}
              </h2>
              <div className="mb-3">
                {mode === "EDIT" && (
                  <Button type="primary" onClick={() => addRelative(id?.id)}>
                    <CheckCircleOutlined />
                    {t("edit_relative")}
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
                    mode={mode}
                    model={model}
                    regNumber={regNumber}
                    updateCompany={updateCompany}
                    modelProps={modelProps}
                    setIsEdit={setIsEdit}
                  />
                ),
              },
            ]}
          />
        </div>
      </Form>
    </>
  );
};

export default RegisterForm;
