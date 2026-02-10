import React, { useState, useEffect, useCallback } from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button, message, Modal } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
import ConclusionService from "services/ConclusionService";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LeftCircleOutlined, PlusCircleOutlined, CheckCircleOutlined } from "@ant-design/icons";

const ADD = "ADD";
const EDIT = "EDIT";

const ConclusionForm = (props) => {
  const { t } = useTranslation();
  const { mode = ADD, param = {} } = props;
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [submitLoading, setSubmitLoading] = useState(false);
  const { id = "" } = param;

  const loadData = useCallback(async (id) => {
    try {
      const response = await ConclusionService.getById(id);
      // API spec: GET /conclusion/get/{id} returns the object directly or inside data?
      // Try common patterns: response.data.conclusion or response.data
      const payload = response?.data?.conclusion || response?.data || {};
      const { name, title, to_who, to_position, tittle_center, executor, boss, first_input, second_input, to_organization  } = payload;
      form.setFieldsValue({ name, title, to_who, to_position, tittle_center, executor, boss, first_input, second_input, to_organization });
    } catch (error) {
      console.error(error);
      message.error(t("no_data"));
    }
  }, [form, t]);

  useEffect(() => { if (mode === EDIT && id) { loadData(id); } }, [mode, id, loadData]);

  const backHandle = useCallback(() => {
    Modal.confirm({
      title: t("warning"),
      content: t("exit_confirmation"),
      okText: t("yes"),
      cancelText: t("no"),
      onOk: () => { navigate(-1); }
    });
  }, [navigate, t]);

  useEffect(() => {
    const handleEscKey = (event) => { if (event.key === "Escape") { event.preventDefault(); backHandle(); } };
    document.addEventListener("keydown", handleEscKey);
    return () => { document.removeEventListener("keydown", handleEscKey); };
  }, [backHandle]);

  const onFinish = async () => {
    setSubmitLoading(true);
    form.validateFields().then(async (values) => {
      try {
        if (mode === EDIT) {
          const res = await ConclusionService.update({ id, ...values });
          if (res.status === 200) { message.success(t("updated_successfully")); navigate("/app/conclusion-list"); }
        } else {
          const res = await ConclusionService.create(values);
            if (res.status === 201) { message.success(t("created_successfully")); navigate("/app/conclusion-list"); }
        }
      } catch (e) {
        message.error(t("please_enter_all_required_field"));
      } finally { setSubmitLoading(false); }
    }).catch(() => { setSubmitLoading(false); message.error(t("please_enter_all_required_field")); });
  };

  return (
    <Form layout="vertical" form={form} name="conclusion_form" onFinish={onFinish}>
      <PageHeaderAlt className="border-bottom" overlap>
        <div className="container">
          <Flex className="py-2" mobileFlex={false} justifyContent="space-between" alignItems="center">
            <h2 className="mb-3">{mode === ADD ? t("add_new_conclusion") : t("edit_conclusion")}</h2>
            <div className="mb-3">
              <Button type="primary" htmlType="submit" loading={submitLoading}>{mode === ADD ? <PlusCircleOutlined /> : <CheckCircleOutlined />}{mode === ADD ? t("add") : t("save")}</Button>
              <Button className="ml-2" onClick={backHandle}><LeftCircleOutlined /> {t("back")}</Button>
            </div>
          </Flex>
        </div>
      </PageHeaderAlt>
      <div className="container">
        <Tabs defaultActiveKey="1" style={{ marginTop: 30 }} items={[{ label: t("general"), key: "1", children: <GeneralField form={form} mode={mode} loading={submitLoading} /> }]} />
      </div>
    </Form>
  );
};

export default ConclusionForm;
