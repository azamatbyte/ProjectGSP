import React, { useState, useEffect, useCallback } from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button, message, Modal } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import RaportService from "services/RaportService";
import { CheckCircleOutlined, LeftCircleOutlined } from "@ant-design/icons";
const ADD = "ADD";
const EDIT = "EDIT";

const RaportForm = (props) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { mode = ADD } = props;
  const [form] = Form.useForm();
  const [uploadedFile, setUploadedFile] = useState(null);
  const [raportId, setRaportId] = useState(null);
  const [linkId, setLinkId] = useState(null);
  const [relatives, setRelatives] = useState([]);

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

  const onFinish = async (values) => {
    try {
      if (mode === "EDIT") {
        try {
          if (uploadedFile) {
            values.link = uploadedFile;
          }
          if (raportId) {
            values.id = raportId;
          }
          // relative_info faqat UI uchun, backendga yuborilmaydi
          if ("relative_info" in values) {
            delete values.relative_info;
          }
          // Attach relatives data from GeneralField
          if (Array.isArray(relatives) && relatives.length > 0) {
            values.relatives = relatives;
          } else {
            values.relatives = [];
          }
          const res = await RaportService.update(values);
          if (res.status === 200) {
            message.success(t("raport_successfully_updated"));
            // Keep link record updated (without changing adminCheck)
            // await RaportService.updateLinkStatus({ id: linkId });
            // // if (linkId) {
            // //   await RaportService.updateLinkStatus({ id: linkId });
            // // }
            navigate(-1);
          }
        } catch (error) {
          console.log("error", error);
          message.error(t("raport_not_updated"));
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
              <h2 className="mb-3"> {t("raport_sp")+" "+t("edit")} </h2>
              <div className="mb-3">
                <Button className="mr-2" type="primary" htmlType="submit">
                  <CheckCircleOutlined />
                  {mode === EDIT ? t("update") : t("save")}
                </Button>
                <Button className="ml-2" onClick={() => backHandle()}>
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
                    uploadedFile={uploadedFile}
                    form={form}
                    setRaportId={setRaportId}
                    setUploadedFile={setUploadedFile}
                    setLinkId={setLinkId}
                    relatives={relatives}
                    setRelatives={setRelatives}
                  />
                ),
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
