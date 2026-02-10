import React from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
import { useNavigate } from "react-router-dom";

const AdminForm = () => {
  const [form] = Form.useForm();

  const navigate = useNavigate();

  const handleBack = () => {
    navigate(-1);
  };

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
              <h2 className="mb-3"> Info Logs of Relation </h2>
              <div className="mb-3">
                <Button
                  className="mr-2"
                  onClick={() => handleBack()}
                  htmlType="submit"
                >
                  Back
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
                label: "General",
                key: "1",
                children: <GeneralField />,
              },
            ]}
          />
        </div>
      </Form>
    </>
  );
};

export default AdminForm;
