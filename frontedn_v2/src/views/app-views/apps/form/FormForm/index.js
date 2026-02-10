import React, { useState, useEffect, useCallback } from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button, message, Modal } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
import FormService from "services/FormService";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LeftCircleOutlined, PlusCircleOutlined, CheckCircleOutlined } from "@ant-design/icons";
const ADD = "ADD";
const EDIT = "EDIT";

const FormForm = (props) => {
  const { t } = useTranslation();
  const { mode = ADD, param = {} } = props;
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [submitLoading, setSubmitLoading] = useState(false);
  const { id = "" } = param;

  const formInformation = useCallback(async (id) => {
    try {
      const response = await FormService.getById(id);
      const { name, description, length, month } = response?.data?.form;
      form.setFieldsValue({
        name,
        description,
        length,
        month,
      });
    } catch (error) {
      console.error("Xatolik:", error);
      message.error(t("no_data"));
    }
  }, [form, t]);

  useEffect(() => {
    if (mode === EDIT) {
      formInformation(id);
    }
  }, [mode, id, formInformation]);

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

  const onFinish = async () => {
    setSubmitLoading(true);
    if (mode === EDIT) {
      form
        .validateFields()
        .then(async (values) => {
          const res = await FormService.update(id, values);
          if (res.status === 200) {
            setSubmitLoading(false);
            message.success(t("form_updated_successfully"));
            navigate("/app/form-list");
          }
        })
        .catch((info) => {
          setSubmitLoading(false);
          message.error(t("please_enter_all_required_field"));
        });
    } else {
      form
        .validateFields()
        .then(async (values) => {
          values.length = parseInt(values.length);
          const res = await FormService.create(values);
          if (res.status === 201) {
            setSubmitLoading(false);
            message.success(t("form_created_successfully"));
            navigate("/app/form-list");
          }
        })
        .catch((info) => {
          setSubmitLoading(false);
          message.error(t("please_enter_all_required_field"));
        });
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
                {mode === "ADD" ? t("add_new_form") : t("edit_form")}{" "}
              </h2>
              <div className="mb-3">
                <Button
                  type="primary"
                  htmlType="submit"
                  tabIndex={10}
                  loading={submitLoading}
                >
                  {mode === "ADD" ? <PlusCircleOutlined /> : <CheckCircleOutlined />}
                  {mode === "ADD" ? t("add") : t("save")}
                </Button>
                <Button className="ml-2" onClick={backHandle} tabIndex={11}>
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
                children: <GeneralField form={form} loading={submitLoading} />,
              },
            ]}
          />
        </div>
      </Form>
    </>
  );
};

export default FormForm;
