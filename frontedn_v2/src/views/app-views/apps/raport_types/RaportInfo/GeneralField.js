import React, { useEffect, useState } from "react";
import { Input, Row, Col, Card, Form, Spin, message } from "antd";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import RaportTypesService from "services/RaportTypesService";

const GeneralField = (props) => {
  const [loading, setLoading] = useState(true);
  const [registrationData, setRegistrationData] = useState(null);
  const { id } = useParams();
  const { t } = useTranslation();

  useEffect(() => {
    const fetchRaportData = async (id) => {
      try {
        setLoading(true);
        const response = await RaportTypesService.getById(id);
        console.log("Begisdsdn");
        console.log(response?.data?.data);
        console.log(response);
        console.log("End");
        setRegistrationData({
          ...response?.data?.data,
          editable_word: response?.data?.data?.data?.editableWord || "",
        });
        if (response.status !== 200) throw new Error("Failed to fetch data");
      } catch (error) {
        message.error("Failed to load raport data");
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchRaportData(id);
    }
  }, [id]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "50px" }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Row gutter={16}>
      <Col xs={24} sm={24} md={17}>
        <Card>
          <Form layout="vertical" initialValues={registrationData}>
            <Row gutter={16}>
              <Col xs={24} sm={24} md={12}>
                <Form.Item name="name" label={t("name")}>
                  <Input className="w-100" tabIndex={1} readOnly />
                </Form.Item>
              </Col>
              {/* <Col xs={24} sm={24} md={12}>
                <Form.Item name="code" label={t("code")}>
                  <Input className="w-100" tabIndex={2} readOnly />
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={12}>
                <Form.Item name="code_ru" label={t("code_ru")}>
                  <Input className="w-100" tabIndex={3} readOnly />
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={12}>
                <Form.Item name="code_uz" label={t("code_uz")}>
                  <Input className="w-100" tabIndex={4} readOnly />
                </Form.Item>
              </Col> */}
              <Col xs={24} sm={24} md={12}>
                <Form.Item name="requested_organization" label={t("organization")}>
                  <Input className="w-100" tabIndex={5} readOnly />
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={12}>
                <Form.Item
                  name="organization"
                  label={t("requested_organization")}
                >
                  <Input className="w-100" tabIndex={6} readOnly />
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={12}>
							<Form.Item name="rank" label={t("rank")}>
								<Input
									className="w-100"
									tabIndex={7}
                  readOnly
								/>
							</Form.Item>
						</Col>
              <Col xs={24} sm={24} md={12}>
                <Form.Item name="notes" label={t("notes")}>
                  <Input className="w-100" tabIndex={10} readOnly />
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={24}>
                <Form.Item name="editable_word" label={t("editable_word")}>
                  <Input.TextArea className="w-100" rows={4} readOnly />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Card>
      </Col>
    </Row>
  );
};

export default GeneralField;
