import React, { useState, useEffect, useCallback } from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button, message, Modal } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
import { useNavigate } from "react-router-dom";
import RegistrationFourService from "services/RegistartionFourService";
import RelativeService from "services/RelativeService";
import { useTranslation } from "react-i18next";
import { LeftCircleOutlined } from "@ant-design/icons";
export const ADD = "ADD";
export const EDIT = "EDIT";

const Index = (props) => {
  const navigate = useNavigate();
  const { mode = ADD, params, redirect } = props;
  const [form] = Form.useForm();
  const [submitLoading, setSubmitLoading] = useState(false);
  const { t } = useTranslation();
  const [data, setData] = useState(null);

  const { id = "" } = params;

  const userInformation = useCallback(async (id) => {
    try {
      const response = await RegistrationFourService.getById(id);
      if(response?.data?.data?.registration_four_similarity){
        setData((prevData) => [...(prevData || []), ...response.data.data.registration_four_similarity]);
      }
      if(response?.data?.data?.registrationSimilarity){
        setData((prevData) => [...(prevData || []), ...response.data.data.registrationSimilarity]);
      }
      
      if(response?.data?.data){
        form.setFieldsValue({
          firstName: response?.data?.data?.firstName,
          lastName: response?.data?.data?.lastName,
          fatherName: response?.data?.data?.fatherName,
          birthYear: response?.data?.data?.birthYear,
          birthPlace: response?.data?.data?.birthPlace,
          residence: response?.data?.data?.residence,
          workplace: response?.data?.data?.workplace,
        });
      }
      // const data = response?.data?.relative;
      // const initiatorName =
      //   data?.Initiator?.first_name + " " + data?.Initiator?.last_name;
      // console.log(data?.birthYear);
      // form.setFieldsValue({
      //   relationshipName: data?.registration?.fullName
      //     ? data?.registration?.fullName
      //     : "",
      //   relationship: data?.id,
      //   firstName: data?.firstName ? data?.firstName : "",
      //   lastName: data?.lastName ? data?.lastName : "",
      //   fatherName: data?.fatherName ? data?.fatherName : "",
      //   relationDegree: data?.relationDegree ? data?.relationDegree : "",
      //   or_tab: initiatorName,
      //   birthYear: data?.birthYear ? data?.birthYear : null,
      //   birthDate: data?.birthDate ? dayjs(data?.birthDate) : null,
      //   birthPlace: data?.birthPlace ? data?.birthPlace : "",
      //   residence: data?.residence ? data?.residence : "",
      //   workplace: data?.workplace ? data?.workplace : "",
      //   nationality: data?.nationality ? data?.nationality : "",
      //   position: data?.position ? data?.position : "",
      //   notes: data?.notes ? data?.notes : "",
      //   model: data?.model ? data?.model : "",
      //   accessStatus: data?.accessStatus ? data?.accessStatus : "",
      //   createdAt: data?.createdAt ? dayjs(data?.createdAt) : null,
      //   updatedAt: data?.updatedAt ? dayjs(data?.updatedAt) : null,
      // });
    } catch (error) {
      console.log("error");
      console.log( error);
      message.error(t("data_not_found"));
    }
  }, [form, t]);

  useEffect(() => {
    userInformation(id);
  }, [id, userInformation]);

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
            if (redirect) {
              navigate(redirect);
            } else {
              navigate(-1);
            }
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
          await RelativeService.update(id, res);
          setSubmitLoading(false);
          message.success("Relative updated successfully");
          if (redirect) {
            navigate(redirect);
          } else {
            navigate(-1);
          }
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
              <h2 className="mb-3">{t("find_matched")} </h2>
              <div className="mb-3">
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
                label: t("general"),
                key: "1",
                children: (
                  <GeneralField
                    form={form}
                    loading={submitLoading}
                    id={id}
                    tableData={data}
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

export default Index;
