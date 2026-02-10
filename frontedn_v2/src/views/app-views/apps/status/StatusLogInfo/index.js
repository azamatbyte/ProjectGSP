import React from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
import { useNavigate } from "react-router-dom";

const AdminForm = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  // const [uploadedImg, setImage] = useState("");
  // const [uploadLoading, setUploadLoading] = useState(false);
  // const [submitLoading, setSubmitLoading] = useState(false);

  // useEffect(() => {
  // 	if(mode === EDIT) {
  // 		const { id } = param;
  // 		const produtId = parseInt(id);
  // 		const productData = ProductListData.filter( product => product.id === produtId);
  // 		const product = productData[0];
  // 		form.setFieldsValue({
  // 			comparePrice: 0.00,
  // 			cost: 0.00,
  // 			taxRate: 6,
  // 			description: "There are many variations of passages of Lorem Ipsum available.",
  // 			category: product.category,
  // 			name: product.name,
  // 			price: product.price
  // 		});
  // 		setImage(product.image);
  // 	}
  // }, [form, mode, param, props]);

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
        initialValues={{
          description: "",
          code: "",
          order: 0,
          active: true,
        }}
      >
        <PageHeaderAlt className="border-bottom" overlap>
          <div className="container">
            <Flex
              className="py-2"
              mobileFlex={false}
              justifyContent="space-between"
              alignItems="center"
            >
              <h2 className="mb-3"> Info Logs of Status </h2>
              <div className="mb-3">
                <Button
                  className="mr-2"
                  onClick={() => handleBack()}
                  htmlType="submit"
                >
                  Back
                </Button>
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
