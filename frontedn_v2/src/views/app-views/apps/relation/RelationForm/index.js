import React, { useState, useEffect, useCallback } from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button, message, Modal } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
import RelationlaceService from "services/RelationlaceService";
import { useNavigate } from "react-router-dom";
import RelationService from "services/RelationlaceService";
import { useTranslation } from "react-i18next";
import { PlusCircleOutlined, CheckCircleOutlined, LeftCircleOutlined } from "@ant-design/icons";


const ADD = "ADD";
const EDIT = "EDIT";

const RelationForm = props => {
	const { t } = useTranslation();
	const { mode = ADD, param= {} } = props;
	const navigate = useNavigate();
	const [form] = Form.useForm();
	const [submitLoading, setSubmitLoading] = useState(false);
	const { id = "" } = param;

	
	const relationInformation = useCallback(async (id) => {
		try {
			const response = await RelationService.getById(id);
			const { name} = response?.data?.relationDegree;
			form.setFieldsValue({
				name
			});
		} catch (error) {
			console.error("Xatolik:", error);
			message.error("Ma'lumot topilmadi");
		}
	}, [form]);

	useEffect(() => {
		if (mode === EDIT) {
			relationInformation(id);
		}
	}, [mode, id, relationInformation]);

	const backHandle = useCallback(() => {
		Modal.confirm({
			title: t("warning"),
			content: t("exit_confirmation"),
			okText: t("yes"),
			cancelText: t("no"),
			onOk: () => {
				navigate("/app/relation-list");
			},
		});
	}, [navigate, t]);

	useEffect(() => {
		const handleEscKey = (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				backHandle();
			}
		};
		document.addEventListener("keydown", handleEscKey);

		return () => {
			document.removeEventListener("keydown", handleEscKey);
		};
	}, [backHandle]);

	const onFinish = async () => {
		setSubmitLoading(true);
		if(mode === EDIT){
			form.validateFields().then(async values => {
				const res = await RelationlaceService.update(id, values.name);
				if (res.status === 200) {
					setSubmitLoading(false);
					message.success(t("relation_updated_successfully"));
					navigate(-1);
				}
			}).catch(info => {
				setSubmitLoading(false);
				message.error(t("please_enter_all_required_fields"));
			});
		}else{
			form.validateFields().then(async values => {
				const res = await RelationlaceService.create(values);
				if (res.status === 201) {
					setSubmitLoading(false);
					message.success(t("relation_created_successfully"));
					navigate(-1);
				}
			}).catch(info => {
				setSubmitLoading(false);
				message.error(t("please_enter_all_required_fields"));
			});
		}
	};

	return (
		<>
			<Form
				layout="vertical"
				form={form}
				name="advanced_search"
				className="ant-advanced-search-form"
				onFinish={onFinish}
			>
				<PageHeaderAlt className="border-bottom" overlap>
					<div className="container">
						<Flex className="py-2" mobileFlex={false} justifyContent="space-between" alignItems="center">
							<h2 className="mb-3">{mode === "ADD" ? t("add_new_relation") : t("edit_relation")} </h2>
							<div className="mb-3">
								<Button className='mr-2' type="primary" htmlType="submit" loading={submitLoading} >
									{mode === "ADD" ? <PlusCircleOutlined /> : <CheckCircleOutlined />}
									{mode === "ADD" ? t("add") : t("save")}
								</Button>
								<Button className="mr-2" onClick={() => backHandle()}><LeftCircleOutlined />{t("back")}</Button>
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
								children: <GeneralField form={form} loading={submitLoading} />,
							},

						]}
					/>
				</div>
			</Form>
		</>
	);
};

export default RelationForm;
