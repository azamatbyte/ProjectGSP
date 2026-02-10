import React, {  useEffect, useCallback } from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
import LogListField from "./LogListField";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LeftCircleOutlined } from "@ant-design/icons";


const StatusForm = () => {
	const { t } = useTranslation();
	const { id } = useParams();

	const [form] = Form.useForm();
	const navigate = useNavigate();

	const backHandle = useCallback(() => {
		navigate(-1);
	}, [navigate]);

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
				initialValues={{
					description: "",
					code: "",
					order: 0,
					active: true,
				}}
			>
				<PageHeaderAlt className="border-bottom" overlap>
					<div className="container">
						<Flex className="py-2" mobileFlex={false} justifyContent="space-between" alignItems="center">
							<h2 className="mb-3">{t("info_status")}</h2>
							<div className="mb-3">
								<Button className="ml-2" onClick={backHandle}><LeftCircleOutlined />{t("back")}</Button>
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

export default StatusForm;
