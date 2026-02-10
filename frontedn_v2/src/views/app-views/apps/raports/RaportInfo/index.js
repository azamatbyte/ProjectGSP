import React, { useState } from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

const ADD = "ADD";
const EDIT = "EDIT";

const RaportInfo = (props) => {
  const { mode = ADD } = props;

  const [form] = Form.useForm();
  const { t } = useTranslation();
  const [uploadedFile, setUploadedFile] = useState(null);

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
              <h2 className="mb-3"> {t("edit_raport")} </h2>
              <div className="mb-3">
                <Button className="mr-2" type="primary" onClick={()=>{handleBack()}}>
                  Back
                </Button>
                <Button className="mr-2" type="submit">
                  {" "}
                  {mode === EDIT ? t("update") : t("save")}
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
                    setUploadedFile={setUploadedFile}
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

export default RaportInfo;
