import React, { useState } from "react";
import {
  Input,
  Row,
  Col,
  Card,
  Form,
  Spin,
} from "antd";
import { useTranslation } from "react-i18next";

const GeneralField = ({ loadingState, form, birthYear }) => {
  const { t } = useTranslation();
  const [loading] = useState(loadingState);
  const [relativeData] = useState(null);

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
          <Form form={form} layout="vertical" initialValues={relativeData}>
            <Row gutter={16}>
              <Col xs={24} sm={24} md={12}>
                <Form.Item name="relationship" label={t("anketa")}>
                  <Input
                    // value={relativeData?.first_name}
                    readOnly
                    className="w-100"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={12}>
                <Form.Item name="relationDegree" label={t("relation_degree")}>
                  <Input className="w-100" readOnly />
                </Form.Item>
              </Col>
              {/* <Col xs={24} sm={24} md={3}>
                <Form.Item name="link" label={t("link")}>
                  <Button type="primary" onClick={handleLink}>
                    {t("link")}
                  </Button>
                </Form.Item>
              </Col> */}
              <Col xs={24} sm={24} md={8}>
                <Form.Item name="lastName" label={t("last_name")}>
                  <Input readOnly className="w-100" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={8}>
                <Form.Item name="firstName" label={t("first_name")}>
                  <Input readOnly className="w-100" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={8}>
                <Form.Item name="fatherName" label={t("father_name")}>
                  <Input readOnly className="w-100" />
                </Form.Item>
              </Col>
              {birthYear ? (
                <Col xs={24} sm={24} md={8}>
                  <Form.Item name="birthYear" label={t("birth_year")}>
                    <Input className="w-100" readOnly />
                  </Form.Item>
                </Col>
              ) : (
                <Col xs={24} sm={24} md={8}>
                  <Form.Item name="birthDate" label={t("birth_year")}>
                    <Input className="w-100" readOnly />
                  </Form.Item>
                </Col>
              )}
               <Col xs={24} sm={24} md={8}>
                <Form.Item name="birthPlace" label={t("birth_place")}>
                  <Input className="w-100" tabIndex={9} readOnly />
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={8}>
                <Form.Item name="nationality" label={t("nationality")}>
                  <Input className="w-100" tabIndex={9} readOnly />
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={12}>
                <Form.Item name="workplace" label={t("workplace")}>
                  <Input className="w-100" readOnly />
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={12}>
                <Form.Item name="residence" label={t("residence")}>
                  <Input className="w-100" readOnly />
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={12}>
                <Form.Item name="initiator" label={t("initiator")}>
                  <Input readOnly className="w-100" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={12}>
                <Form.Item name="position" label={t("position")}>
                  <Input className="w-100" readOnly />
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={24}>
                <Row gutter={16}>
                  <Col xs={12}>
                    <Form.Item name="notes" label={t("compr_info")} readOnly>
                      <Input.TextArea
                        style={{
                          height: "200px",
                          overflowY: "auto",
                          width: "100%",
                        }} // Set max height and enable scrolling
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={12}>
                    <Form.Item
                      name="additionalNotes"
                      label={t("comment")}
                      readOnly
                    >
                      <Input.TextArea
                        style={{
                          height: "200px",
                          overflowY: "auto",
                          width: "100%",
                        }} // Set max height and enable scrolling
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Col>
            </Row>
          </Form>
        </Card>
      </Col>
    </Row>
  );
};

export default GeneralField;
