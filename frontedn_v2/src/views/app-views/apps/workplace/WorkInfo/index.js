import React from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
import LogListField from "./LogListField";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LeftCircleOutlined } from "@ant-design/icons";

const WorkInfo = () => {
	const { id } = useParams();
	const { t } = useTranslation();
	const [form] = Form.useForm();
	const navigate = useNavigate();


	const backHandle = () => {
		navigate(-1);
	};

	const handleEscKey = (event) => {
		if (event.key === "Escape") {
			event.preventDefault();
			backHandle();
		}
	};
	document.addEventListener("keydown", handleEscKey);

	return (
		<>
			<Form
				layout="vertical"
				form={form}
				name="advanced_search"
				className="ant-advanced-search-form"
				initialValues={{
					ipAddress: "",
					lastLogin: "",
					useragent: "",
					resource: "",
				}}
			>
				<PageHeaderAlt className="border-bottom" overlap>
					<div className="container">
						<Flex className="py-2" mobileFlex={false} justifyContent="space-between" alignItems="center">
							<h2 className="mb-3">{t("info_work")}</h2>
							<div className="mb-3">
							<Button className="ml-2" onClick={() => backHandle()}><LeftCircleOutlined />{t("back")}</Button>
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
						style={{marginTop: 30}}
						items={[
							{
								label: t("general"),
								key: "1",
								children: <GeneralField id={id} />,
							},
							{
								label: t("logs"),
								key: "2",
								children: <LogListField id={id} />,
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

export default WorkInfo;
