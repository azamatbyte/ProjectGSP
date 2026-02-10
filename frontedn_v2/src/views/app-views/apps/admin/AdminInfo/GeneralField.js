import React from "react";
import { Input, Row, Col, Card, Form, Spin } from "antd";
import { useTranslation } from "react-i18next";


const GeneralField = props => {
	const { loading, form } = props;

	const { t } = useTranslation();
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
				<Card title={t("basic_info")}>
					<Form
						layout="vertical"
						form={form}
					>
						<Row gutter={16}>
							<Col xs={24} sm={24} md={8}>
								<Form.Item
									name="last_name"
									label={t("last_name")}
								>
									<Input
										readOnly
										className="w-100"
									/>
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={8}>
								<Form.Item
									name="first_name"
									label={t("first_name")}
								>
									<Input
										readOnly
										className="w-100"
									/>
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={8}>
								<Form.Item
									name="father_name"
									label={t("father_name")}
								>
									<Input
										readOnly
										className="w-100"
									/>
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item
									name="birthDate"
									label={t("birth_date")}
								>
									<Input
										readOnly
										className="w-100"
									/>
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item name="phone" label={t("phone")}>
									<Input className="w-100" readOnly />
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item
									name="gender"
									label={t("gender")}
								>
									<Input
										readOnly
										className="w-100"
									/>
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item
									name="role"
									label={t("role")}
								>
									<Input
										readOnly
										className="w-100"
									/>
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item
									name="username"
									label={t("username")}
								>
									<Input
										readOnly
										className="w-100"
									/>
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item name="workplace" label={t("workplace")}>
									<Input className="w-100" readOnly />
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item name="rank" label={t("rank")}>
									<Input className="w-100" readOnly />
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
