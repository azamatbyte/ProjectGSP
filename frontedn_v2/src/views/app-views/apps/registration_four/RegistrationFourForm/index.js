import React, { useState, useEffect, useCallback } from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button, message, Modal } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
import { useNavigate } from "react-router-dom";
import RegistrationFourService from "services/RegistartionFourService";
import { useTranslation } from "react-i18next";
import { LeftCircleOutlined, PlusCircleOutlined, CheckCircleOutlined } from "@ant-design/icons";
export const ADD = "ADD";
export const EDIT = "EDIT";

const RegistrationFourForm = (props) => {
  const navigate = useNavigate();
  const { mode = ADD, params } = props;
  const [form] = Form.useForm();
  const [submitLoading, setSubmitLoading] = useState(false);
  const { t } = useTranslation();

  const { id = "" } = params;

  const userInformation = useCallback(async (id) => {
    try {
      const response = await RegistrationFourService.getById(id);
      const data = response?.data?.data;
      form.setFieldsValue({
        firstName: data?.firstName ? data?.firstName : "",
        lastName: data?.lastName ? data?.lastName : "",
        fatherName: data?.fatherName ? data?.fatherName : "",
        birthYear: data?.birthYear ? data?.birthYear : "",
        birthPlace: data?.birthPlace ? data?.birthPlace : "",
        residence: data?.residence ? data?.residence : "",
        status: data?.status ? data?.status : "",
      });
    } catch (error) {
      message.error(t("data_not_found"));
    }
  }, [form, t]);

  const userInformationEdit = useCallback(async (id) => {
    try {
      const response = await RegistrationFourService.getById(id);
      const data = response?.data?.data;
      form.setFieldsValue({
        relationshipName: data?.fullName ? data?.fullName : "",
        relationship: data?.id,
        or_tab: data?.Initiator?.id,
      });
    } catch (error) {
      console.error("Xatolik:", error);
      message.error(t("data_not_found"));
    }
  }, [form, t]);

  useEffect(() => {
    if (mode === EDIT) {
      userInformation(params?.id);
    } else if (mode === ADD) {
      userInformationEdit(params?.id);
    }
  }, [mode, params?.id, userInformation, userInformationEdit]);

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

  const onFinish = async () => {
    setSubmitLoading(true);
    if (mode === EDIT) {
      await form
        .validateFields()
        .then(async (res) => {
          await RegistrationFourService.update(id, {status: res.status});
          setSubmitLoading(false);
          message.success(t("registration_four_updated_successfully"));
          navigate(-1);
        })
        .catch((info) => {
          message.error(t("please_enter_all_required_field"));
          return null;
        })
        .finally(() => {
          setSubmitLoading(false);
        });
    }
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

  return (
    <>
      <Form
        layout="vertical"
        form={form}
        name="advanced_search"
        className="ant-advanced-search-form"
        onFinish={() => onFinish()}
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
                {mode === "ADD" ? t("add_new_registration_four") : t("edit_registration_four")}{" "}
              </h2>
              <div className="mb-3">
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={submitLoading}
                >
                  {mode === "ADD" ? <PlusCircleOutlined /> : <CheckCircleOutlined />}
                  {mode === "ADD" ? t("add") : t("save")}
                </Button>
                <Button className="ml-2" onClick={() => backHandle()}>
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
                  <GeneralField form={form} loading={submitLoading} id={id} />
                ),
              },
            ]}
          />
        </div>
      </Form>
    </>
  );
};

export default RegistrationFourForm;
