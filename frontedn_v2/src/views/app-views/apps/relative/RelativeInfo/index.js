import React, { useState, useEffect, useCallback } from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button, message } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
import LogListField from "./LogListField";
import { useNavigate, useParams } from "react-router-dom";
import dayjs from "dayjs";
import RelativeService from "services/RelativeService";
import { useTranslation } from "react-i18next";
import { DATE_FORMAT_DD_MM_YYYY_WITH_DOT } from "constants/DateConstant";
import { LeftCircleOutlined, EditOutlined, PlusCircleOutlined, LinkOutlined } from "@ant-design/icons";
import createSession, { SESSION_TYPES } from "utils/sessions";
const ADD = "ADD";
const INFO = "INFO";

const RelativeForm = (props) => {
  const { mode = ADD } = props;
  const params = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [birthYear, setBirthYear] = useState(null);

  useEffect(() => {
    if (mode === INFO) {
      const fetchAdminData = async (id) => {
        try {
          setLoading(true);
          const response = await RelativeService.getById(id);
          // console.log(response?.data?.relative);

          if (response.status !== 200) throw new Error("Failed to fetch data");
          const data = response?.data?.relative;
          const initiatorName =
            data?.Initiator?.first_name + " " + data?.Initiator?.last_name;
          form.setFieldsValue({
            id: data?.id,
            registrationId: data?.registrationId,
            relationship: data?.registration?.fullName
              ? data?.registration?.fullName
              : "",
            firstName: data?.firstName ? data?.firstName : "",
            lastName: data?.lastName ? data?.lastName : "",
            fatherName: data?.fatherName ? data?.fatherName : "",
            relationDegree: data?.relationDegree ? data?.relationDegree : "",
            initiator: initiatorName,
            birthYear: data?.birthYear ? data?.birthYear : null,
            birthDate: data?.birthDate
              ? dayjs(data?.birthDate).format(DATE_FORMAT_DD_MM_YYYY_WITH_DOT)
              : null,
            birthPlace: data?.birthPlace ? data?.birthPlace : "",
            residence: data?.residence ? data?.residence : "",
            workplace: data?.workplace ? data?.workplace : "",
            position: data?.position ? data?.position : "",
            additionalNotes: data?.additionalNotes ? data?.additionalNotes : "",
            notes: data?.notes ? data?.notes : "",
            accessStatus: data?.accessStatus ? data?.accessStatus : "",
            nationality: data?.nationality ? data?.nationality : "",
            createdAt: data?.createdAt ? dayjs(data?.createdAt) : "",
            updatedAt: data?.updatedAt ? dayjs(data?.updatedAt) : "",
          });
          setBirthYear(data?.birthYear);
        } catch (error) {
          message.error(t("failed_to_load_admin_data"));
          console.error("Error fetching data:", error);
        } finally {
          setLoading(false);
        }
      };

      if (params?.id) {
        fetchAdminData(params?.id);
      }
    }
  }, [params?.id, t, form, mode]);

  const onFinish = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handleEdit = useCallback(() => {
    navigate(`/app/apps/relative/edit-relative/${params?.id}`);
  }, [navigate, params?.id]);

  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === "Escape") {
        onFinish();
      }
    };

    document.addEventListener("keydown", handleEscKey);

    return () => {
      document.removeEventListener("keydown", handleEscKey);
    };
  }, [onFinish]);

  const handleLink = useCallback(() => {
    navigate(
      `/app/apps/register/info-register/${form.getFieldValue("registrationId")}`
    );
  }, [navigate, form]);

  return (
    <>
      <Form
        layout="vertical"
        form={form}
        name="advanced_search"
        className="ant-advanced-search-form"
      >
        <PageHeaderAlt className="border-bottom" overlap>
          <div className="container">
            <Flex
              className="py-2"
              mobileFlex={false}
              justifyContent="space-between"
              alignItems="center"
            >
              <h2 className="mb-3"> {t("info_relative")} </h2>
              <div className="mb-3">
                {mode === "INFO" && (
                  <>
                    <Button
                      type="primary"
                      className="mr-2"
                      onClick={handleLink}
                    >
                      <LinkOutlined /> {t("link")}
                    </Button>
                    <Button
                      type="primary"
                      className="mr-2"
                      onClick={() => {
                        createSession(params?.id,SESSION_TYPES.SESSION);
                      }}
                    >
                      <PlusCircleOutlined /> {t("add_main")}
                    </Button>
                    <Button
                      type="primary"
                      className="mr-2"
                      onClick={() => {
                        createSession(params?.id,SESSION_TYPES.RESERVE);
                      }}
                    >
                      <PlusCircleOutlined /> {t("add_reserve")}
                    </Button>
                    <Button
                      type="primary"
                      className="mr-2"
                      onClick={() => {
                        createSession(params?.id,SESSION_TYPES.RAPORT);
                      }}
                    >
                      <PlusCircleOutlined /> {t("add_conclusion")}
                    </Button>
                    <Button
                      type="primary"
                      className="mr-2"
                      onClick={()=>{handleEdit();}}
                    >
                      <EditOutlined /> {t("edit")}
                    </Button>
                    <Button className="mr-2" onClick={() => onFinish()}>
                      <LeftCircleOutlined /> {t("back")}
                    </Button>
                  </>
                )}
                {/* <Button type="primary" onClick={() => onFinish()} htmlType="submit" loading={submitLoading} >
									{mode === 'ADD'? 'Add' : `Save`}
								</Button> */}
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
                    loadingState={loading}
                    birthYear={birthYear}
                    form={form}
                  />
                ),
              },
              {
                label: t("logs"),
                key: "2",
                children: <LogListField id={params?.id} />,
              },
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

export default RelativeForm;
