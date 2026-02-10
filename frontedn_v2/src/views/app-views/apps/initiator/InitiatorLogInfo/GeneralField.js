import React, { useEffect, useState } from "react";
import { Input, Row, Col, Card, Form, Select, Spin, message } from "antd";
import { useParams } from "react-router-dom";
import AuthService from "services/AuthService";
import dayjs from "dayjs";
import "dayjs/locale/en-gb";
import { useTranslation } from "react-i18next";

const { Option } = Select;

dayjs.locale("en-gb");

const GeneralField = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [adminData, setAdminData] = useState(null);
  const { id } = useParams();

  useEffect(() => {
    const fetchAdminData = async (id) => {
      try {
        setLoading(true);
        const response = await AuthService.getById(id);
        setAdminData(response?.data?.user);
        if (response.status !== 200) throw new Error("Failed to fetch data");
      } catch (error) {
        message.error(t("failed_to_load_admin_data"));
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchAdminData(id);
    }
  }, [id, t]);

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
          <Form layout="vertical" initialValues={adminData}>
            <Row gutter={16}>
              <Col xs={24} sm={24} md={12}>
                <Form.Item name="first_name" label={t("first_name")}>
                  <Input
                    value={adminData?.first_name}
                    readOnly
                    className="w-100"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={12}>
                <Form.Item name="last_name" label={t("last_name")}>
                  <Input
                    value={adminData?.last_name}
                    readOnly
                    className="w-100"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={12}>
                <Form.Item name="role" label={t("role")}>
                  <Select disabled className="w-100">
                    <Option value="superAdmin">Super Admin</Option>
                    <Option value="admin">Admin</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={12}>
                <Form.Item name="username" label={t("username")}>
                  <Input
                    readOnly
                    className="w-100"
                    value={adminData?.username}
                  />
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
