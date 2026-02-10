import React, { useState, useEffect, useCallback } from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button, message, Modal } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
import { useNavigate, useParams } from "react-router-dom";
import dayjs from "dayjs";
import RelativeService from "services/RelativeService";
import RegistrationService from "services/RegistrationService";
import { useTranslation } from "react-i18next";
import { LeftCircleOutlined, PlusCircleOutlined, CheckCircleOutlined } from "@ant-design/icons";
export const ADD = "ADD";
export const EDIT = "EDIT";

const AdminForm = (props) => {
  const params = useParams();
  const navigate = useNavigate();
  const { mode = ADD } = props;
  const [form] = Form.useForm();
  const [submitLoading, setSubmitLoading] = useState(false);
  const { t } = useTranslation();

  const { id = "" } = params;

  const userInformation = useCallback(async (id) => {
    try {
      const response = await RelativeService.getById(id);
      const data = response?.data?.relative;
      const initiatorName =
        data?.Initiator?.first_name + " " + data?.Initiator?.last_name;
      console.log(data?.birthYear);
      form.setFieldsValue({
        relationshipName: data?.registration?.fullName
          ? data?.registration?.fullName
          : "",
        relationship: data?.id,
        firstName: data?.firstName ? data?.firstName : "",
        lastName: data?.lastName ? data?.lastName : "",
        fatherName: data?.fatherName ? data?.fatherName : "",
        relationDegree: data?.relationDegree ? data?.relationDegree : "",
        or_tab: initiatorName,
        birthYear: data?.birthYear ? data?.birthYear : null,
        birthDate: data?.birthDate ? dayjs(data?.birthDate) : null,
        birthPlace: data?.birthPlace ? data?.birthPlace : "",
        residence: data?.residence ? data?.residence : "",
        workplace: data?.workplace ? data?.workplace : "",
        nationality: data?.nationality ? data?.nationality : "",
        position: data?.position ? data?.position : "",
        notes: data?.notes ? data?.notes : "",
        model: data?.model ? data?.model : "",
        accessStatus: data?.accessStatus ? data?.accessStatus : "",
        createdAt: data?.createdAt ? dayjs(data?.createdAt) : null,
        updatedAt: data?.updatedAt ? dayjs(data?.updatedAt) : null,
      });
    } catch (error) {
      message.error(t("data_not_found"));
    }
  }, [form, t]);

  const userInformationEdit = useCallback(async (id) => {
    try {
      const response = await RegistrationService.getById(id);
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
    if (mode === ADD) {
      await form
        .validateFields()
        .then(async (res) => {
          try {
            if (!res?.model) {
              res.model = "relative";
            }
            await RelativeService.create(res);
            setSubmitLoading(false);
            message.success("Relative created successfully");
            navigate(-1);
          } catch (error) {
            setSubmitLoading(false);
            message.error(t("please_enter_all_required_field"));
            return null;
          }
        })
        .catch((info) => {
          setSubmitLoading(false);
          message.error(t("please_enter_all_required_field"));
          return null;
        });
    } else if (mode === EDIT) {
      await form
        .validateFields()
        .then(async (res) => {
          if (!res?.model) {
            res.model = "relative";
          }
          const response = await RelativeService.update(id, res);
          console.log("response", response);
          setSubmitLoading(false);
          message.success("Relative updated successfully");
          navigate(-1);
        })
        .catch((info) => {
          console.log("info", info);
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
        event.preventDefault();
        backHandle();
      }
    };

    document.addEventListener("keydown", handleEscKey);

    return () => {
      document.removeEventListener("keydown", handleEscKey);
    };
  }, [backHandle]);

  const viewDetails = (id) => {
    navigate(`/app/apps/relative/info-relative/${id}`);
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
                {mode === "ADD" ? t("add_new_relative") : t("edit_relative")}{" "}
              </h2>
              <div className="mb-3">
                <Button type="primary" className="mr-2" onClick={() => viewDetails(id?.id)}>
                  <CheckCircleOutlined />
                  {t("view_details")}
                </Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={submitLoading}
                  tabIndex={15}
                >
                  {mode === "ADD" ? <PlusCircleOutlined /> : <CheckCircleOutlined />}
                  {mode === "ADD" ? t("add") : t("save")}
                </Button>
                <Button className="ml-2" onClick={backHandle} tabIndex={16}>
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

export default AdminForm;
