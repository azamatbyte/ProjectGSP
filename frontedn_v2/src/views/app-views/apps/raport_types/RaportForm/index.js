import React, { useEffect, useCallback } from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button, message, Modal } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import RaportTypesService from "services/RaportTypesService";
import { LeftCircleOutlined, CheckCircleOutlined } from "@ant-design/icons";
const ADD = "ADD";
const EDIT = "EDIT";

const RaportForm = (props) => {
  const { t } = useTranslation();
  const { mode = ADD, param, id } = props;

  const [form] = Form.useForm();

  const navigate = useNavigate();

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

  const fetchRaportData = useCallback(async () => {
    try {
      const response = await RaportTypesService.getById(id);
      form.setFieldsValue({
        name: response?.data?.data?.name,
        code_ru: response?.data?.data?.code_ru,
        code_uz: response?.data?.data?.code_uz,
        code: response?.data?.data?.code,
        description: response?.data?.data?.description,
        organization: response?.data?.data?.organization,
        requested_organization: response?.data?.data?.requested_organization,
        rank: response?.data?.data?.rank,
        signed_fio: response?.data?.data?.signed_fio,
        signed_position: response?.data?.data?.signed_position,
        notes: response?.data?.data?.notes,
        editable_word: response?.data?.data?.data?.editableWord || "",
      });
    } catch (error) {
      console.log(error);
    }
  }, [id, form]);

  useEffect(() => {
    if (mode === EDIT) {
      fetchRaportData(param?.id);
    }
  }, [mode, param, id, fetchRaportData]);

  const onFinish = async () => {
    const buildPayload = (values) => {
      const payload = {
        ...values,
        data: {
          ...(values?.data && typeof values.data === "object" ? values.data : {}),
          editableWord: values?.editable_word || "",
        },
      };

      delete payload.editable_word;

      return payload;
    };

    if (mode === ADD) {
      await form
        .validateFields()
        .then(async (res) => {
          try {
            await RaportTypesService.create(buildPayload(res));
            message.success(t("requirements_created_successfully"));
            navigate(-1);
          } catch (error) {
            message.error(t("please_enter_all_required_field"));
            return null;
          }
        })
        .catch((info) => {
          message.error(t("please_enter_all_required_field"));
          return null;
        });
    } else if (mode === EDIT) {
      await form
        .validateFields()
        .then(async (res) => {
          await RaportTypesService.update(id, buildPayload(res));
          message.success(t("requirements_updated_successfully"));
          navigate(-1);
        })
        .catch((info) => {
          message.error(t("please_enter_all_required_field"));
          return null;
        })
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
                {mode === "add" ? t("add_requirefments") : t("edit_requirements")} 
              </h2>
              <div className="mb-3">
                <Button
                  className="mr-2"
                  type="primary"
                  htmlType="submit"
                  tabIndex={11}
                >
                  {mode === ADD ? <CheckCircleOutlined /> : <CheckCircleOutlined />}
                  {mode === ADD ? t("save") : t("update")}
                </Button>
                <Button className="mr-2" onClick={backHandle} tabIndex={12}>
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
                children: <GeneralField form={form} />,
              },
              // {
              // 	label: 'Logs',
              // 	key: '2',
              // 	children: <ServicesField />,
              // },
              // {
              // 	label: 'Sessions',
              // 	key: '3',
              // 	children: <SessionsField />,
              // },
            ]}
          />
        </div>
      </Form>
    </>
  );
};

export default RaportForm;
