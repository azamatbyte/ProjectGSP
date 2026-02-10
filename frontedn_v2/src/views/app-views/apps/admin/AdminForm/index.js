import React, { useState, useEffect, useCallback } from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button, message, Modal } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
import AuthService from "services/AuthService";
import { useNavigate } from "react-router-dom";
import Request from "utils/request";
import { get_user_by_id } from "utils/api_urls";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { CheckCircleOutlined, LeftCircleOutlined, PlusCircleOutlined } from "@ant-design/icons";
const ADD = "ADD";
const EDIT = "EDIT";

const AdminForm = (props) => {
  const navigate = useNavigate();
  const { mode = ADD, param = {} } = props;
  const [form] = Form.useForm();
  const [uploadedImg, setImage] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const { id = "" } = param;
  const { t } = useTranslation();

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

  const userInformation = useCallback(async (id) => {
    try {
      const response = await Request.getRequest(`${get_user_by_id}?id=${id}`);
      const {
        first_name,
        last_name,
        father_name,
        username,
        role,
        birthDate,
        workplace,
        phone,
        rank,
        position
      } = response?.data?.user;
      form.setFieldsValue({
        first_name,
        last_name,
        father_name,
        username,
        role,
        birthDate: birthDate ? dayjs(birthDate) : null,
        workplace,
        phone,
        rank,
        position
      });
    } catch (error) {
      console.error("Xatolik:", error);
      message.error(t("data_not_found"));
    }
  }, [form, t]);

  useEffect(() => {
    if (mode === EDIT) {
      userInformation(id);
    }
  }, [mode, id, userInformation]);

  const onFinish = async () => {
    setSubmitLoading(true);
    if (mode === EDIT) {
      form
        .validateFields()
        .then(async (values) => {
          if (uploadedImg !== "") {
            values.photo = uploadedImg;
          }
          const res = await AuthService.update(id, values);
          if (res.status === 200) {
            setSubmitLoading(false);
            message.success(t("admin_updated_successfully"));
            navigate(-1);
          }
        })
        .catch((info) => {
          setSubmitLoading(false);
          message.error(t("please_enter_all_required_fields"));
        });
    } else if (mode === ADD) {
      form
        .validateFields()
        .then(async (values) => {
          if (uploadedImg !== "") {
            values.photo = uploadedImg;
          }
          const res = await AuthService.create(values);
          if (res.status === 201) {
            setSubmitLoading(false);
            message.success(t("admin_created_successfully"));
            navigate(-1);
          }
        })
        .catch((info) => {
          setSubmitLoading(false);
          message.error(t("please_enter_all_required_fields"));
        });
    }
  };

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
                {mode === "ADD" ? t("add_new_admin") : t("edit_admin")}{" "}
              </h2>
              <div className="mb-3">

                <Button
                  type="primary"
                  htmlType="submit"
                  onClick={onFinish}
                  tabIndex={12}
                  loading={submitLoading}
                  className="mr-2"
                >
                  {mode === "ADD" ? <PlusCircleOutlined /> : <CheckCircleOutlined />}
                  {mode === "ADD" ? t("add") : t("save")}
                </Button>
                <Button onClick={backHandle} tabIndex={13}>
                  <LeftCircleOutlined />
                  {t("back")}
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
                    setImage={setImage}
                    loading={submitLoading}
                    id={id}
                    mode={mode}
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

export default AdminForm;
